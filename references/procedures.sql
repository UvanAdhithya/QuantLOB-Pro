-- =====================================================
-- DBMS PROJECT — QuantLOB
-- Stored Procedures, Functions, Cursors & Triggers
-- =====================================================
-- All procedures implement event-sourced patterns:
--   - Never mutate orders directly for state changes
--   - Always emit events; triggers handle derived state
--   - Use explicit transaction boundaries
-- =====================================================

USE lob_system;

-- =====================================================
-- PROCEDURE 1: place_order
-- Idempotent order placement with event emission
-- =====================================================
-- Transaction boundary: SINGLE TX for order + event
-- Isolation: REPEATABLE READ (session default)
-- Idempotency: via idempotency_key UNIQUE constraint
-- =====================================================

DELIMITER $$

CREATE PROCEDURE place_order(
    IN p_trader_id       INT,
    IN p_instrument_id   INT,
    IN p_side            ENUM('BUY','SELL'),
    IN p_order_type      ENUM('LIMIT','MARKET'),
    IN p_price           DECIMAL(12,4),
    IN p_quantity        INT,
    IN p_idempotency_key VARCHAR(64)
)
BEGIN
    DECLARE v_order_id BIGINT;
    DECLARE v_existing BIGINT DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order placement failed — rolled back';
    END;

    -- Idempotency check: has this order been submitted before?
    IF p_idempotency_key IS NOT NULL THEN
        SELECT order_id INTO v_existing
        FROM orders
        WHERE idempotency_key = p_idempotency_key
        LIMIT 1;
    END IF;

    IF v_existing IS NOT NULL THEN
        -- Return existing order (idempotent response)
        SELECT v_existing AS order_id, 'DUPLICATE' AS result;
    ELSE
        START TRANSACTION;

        -- Insert order (trigger auto-sets remaining_quantity)
        INSERT INTO orders (
            trader_id, instrument_id, side, order_type,
            price, quantity, idempotency_key
        ) VALUES (
            p_trader_id, p_instrument_id, p_side, p_order_type,
            p_price, p_quantity, p_idempotency_key
        );

        SET v_order_id = LAST_INSERT_ID();
        -- NOTE: trg_orders_after_insert auto-emits ORDER_PLACED event

        COMMIT;

        SELECT v_order_id AS order_id, 'PLACED' AS result;
    END IF;
END$$

DELIMITER ;


-- =====================================================
-- PROCEDURE 2: cancel_order
-- Cancels an open order with event emission
-- =====================================================
-- Transaction boundary: SINGLE TX for event + status
-- Concurrency: SELECT ... FOR UPDATE prevents race
-- =====================================================

DELIMITER $$

CREATE PROCEDURE cancel_order(
    IN p_order_id BIGINT
)
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_remaining INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order cancellation failed — rolled back';
    END;

    START TRANSACTION;

    -- Lock the order row to prevent concurrent modification
    SELECT status, remaining_quantity
    INTO v_status, v_remaining
    FROM orders
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order not found';
    ELSEIF v_status NOT IN ('OPEN', 'PARTIALLY_FILLED') THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only OPEN or PARTIALLY_FILLED orders can be cancelled';
    ELSE
        -- Emit ORDER_CANCELLED event
        -- (trigger trg_events_after_insert updates orders.status)
        INSERT INTO order_events (order_id, event_type, quantity, price, remaining_after)
        VALUES (
            p_order_id,
            'ORDER_CANCELLED',
            v_remaining,
            (SELECT price FROM orders WHERE order_id = p_order_id),
            0
        );

        COMMIT;

        SELECT p_order_id AS order_id, 'CANCELLED' AS result;
    END IF;
END$$

DELIMITER ;


-- =====================================================
-- PROCEDURE 3: execute_matching
-- DB-driven matching engine for a single instrument
-- =====================================================
-- ALGORITHM:
--   1. Find best bid (highest BUY, FIFO tiebreak)
--   2. Find best ask (lowest SELL, FIFO tiebreak)
--   3. If bid.price >= ask.price → match
--   4. Execution price = resting order's price (passive)
--   5. Emit fill events + trade record
--   6. Loop until no more crosses
--
-- Transaction boundary: SINGLE TX per match
-- Concurrency: FOR UPDATE on both matched orders
-- =====================================================

DELIMITER $$

CREATE PROCEDURE execute_matching(
    IN p_instrument_id INT
)
BEGIN
    DECLARE v_buy_id BIGINT;
    DECLARE v_sell_id BIGINT;
    DECLARE v_buy_price DECIMAL(12,4);
    DECLARE v_sell_price DECIMAL(12,4);
    DECLARE v_buy_remaining INT;
    DECLARE v_sell_remaining INT;
    DECLARE v_exec_qty INT;
    DECLARE v_exec_price DECIMAL(12,4);
    DECLARE v_matches_found BOOLEAN DEFAULT TRUE;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
    END;

    -- Loop until no more matching pairs exist
    match_loop: WHILE v_matches_found DO

        SET v_buy_id = NULL;
        SET v_sell_id = NULL;

        -- ─── Find best bid ───
        SELECT order_id, price, remaining_quantity
        INTO v_buy_id, v_buy_price, v_buy_remaining
        FROM orders
        WHERE instrument_id = p_instrument_id
          AND side = 'BUY'
          AND status IN ('OPEN', 'PARTIALLY_FILLED')
          AND remaining_quantity > 0
        ORDER BY price DESC, created_at ASC
        LIMIT 1
        FOR UPDATE;

        IF v_buy_id IS NULL THEN
            SET v_matches_found = FALSE;
            LEAVE match_loop;
        END IF;

        -- ─── Find best ask that crosses ───
        SELECT order_id, price, remaining_quantity
        INTO v_sell_id, v_sell_price, v_sell_remaining
        FROM orders
        WHERE instrument_id = p_instrument_id
          AND side = 'SELL'
          AND status IN ('OPEN', 'PARTIALLY_FILLED')
          AND remaining_quantity > 0
          AND price <= v_buy_price
        ORDER BY price ASC, created_at ASC
        LIMIT 1
        FOR UPDATE;

        IF v_sell_id IS NULL THEN
            SET v_matches_found = FALSE;
            LEAVE match_loop;
        END IF;

        -- ─── Execute the match ───
        -- Price = resting (passive) order's price
        -- In price-time priority, the order that was in the
        -- book first determines the execution price
        SET v_exec_price = v_sell_price;
        SET v_exec_qty = LEAST(v_buy_remaining, v_sell_remaining);

        START TRANSACTION;

        -- Insert trade record (denormalized with instrument_id)
        INSERT INTO trades (instrument_id, buy_order_id, sell_order_id, price, quantity)
        VALUES (p_instrument_id, v_buy_id, v_sell_id, v_exec_price, v_exec_qty);

        -- Emit buy-side fill event
        INSERT INTO order_events (order_id, event_type, quantity, price, remaining_after)
        VALUES (
            v_buy_id,
            IF(v_buy_remaining - v_exec_qty = 0, 'ORDER_FILLED', 'ORDER_PARTIALLY_FILLED'),
            v_exec_qty,
            v_exec_price,
            v_buy_remaining - v_exec_qty
        );

        -- Emit sell-side fill event
        INSERT INTO order_events (order_id, event_type, quantity, price, remaining_after)
        VALUES (
            v_sell_id,
            IF(v_sell_remaining - v_exec_qty = 0, 'ORDER_FILLED', 'ORDER_PARTIALLY_FILLED'),
            v_exec_qty,
            v_exec_price,
            v_sell_remaining - v_exec_qty
        );

        -- NOTE: trg_events_after_insert automatically updates
        --   orders.remaining_quantity and orders.status

        COMMIT;

    END WHILE;
END$$

DELIMITER ;


-- =====================================================
-- PROCEDURE 4: update_order_price (Amendment)
-- Amends an open order's price with event trail
-- =====================================================

DELIMITER $$

CREATE PROCEDURE update_order_price(
    IN p_order_id   BIGINT,
    IN p_new_price  DECIMAL(12,4)
)
BEGIN
    DECLARE v_old_price DECIMAL(12,4);
    DECLARE v_remaining INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
    END;

    START TRANSACTION;

    SELECT price, remaining_quantity
    INTO v_old_price, v_remaining
    FROM orders
    WHERE order_id = p_order_id
      AND status IN ('OPEN', 'PARTIALLY_FILLED')
    FOR UPDATE;

    IF v_old_price IS NULL THEN
        ROLLBACK;
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order not found or not amendable';
    END IF;

    -- Update the order price
    UPDATE orders SET price = p_new_price WHERE order_id = p_order_id;

    -- Emit ORDER_AMENDED event (audit trail)
    INSERT INTO order_events (order_id, event_type, quantity, price, remaining_after)
    VALUES (p_order_id, 'ORDER_AMENDED', v_remaining, p_new_price, v_remaining);

    COMMIT;
END$$

DELIMITER ;


-- =====================================================
-- PROCEDURE 5: calculate_total_volume (OUT param demo)
-- Demonstrates OUT parameters for academic requirement
-- =====================================================

DELIMITER $$

CREATE PROCEDURE calculate_total_volume(
    IN p_instrument_id INT,
    OUT p_total_volume INT
)
BEGIN
    SELECT COALESCE(SUM(remaining_quantity), 0)
    INTO p_total_volume
    FROM orders
    WHERE instrument_id = p_instrument_id
      AND status IN ('OPEN', 'PARTIALLY_FILLED');
END$$

DELIMITER ;


-- =====================================================
-- FUNCTION 1: get_vwap (per instrument)
-- Volume Weighted Average Price from trades
-- =====================================================

DELIMITER $$

CREATE FUNCTION get_vwap(p_instrument_id INT)
RETURNS DECIMAL(12,4)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_vwap DECIMAL(12,4);

    SELECT SUM(price * quantity) / NULLIF(SUM(quantity), 0)
    INTO v_vwap
    FROM trades
    WHERE instrument_id = p_instrument_id;

    RETURN COALESCE(v_vwap, 0);
END$$

DELIMITER ;


-- =====================================================
-- FUNCTION 2: get_spread (per instrument)
-- Current bid-ask spread
-- =====================================================

DELIMITER $$

CREATE FUNCTION get_spread(p_instrument_id INT)
RETURNS DECIMAL(12,4)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_best_bid DECIMAL(12,4);
    DECLARE v_best_ask DECIMAL(12,4);

    SELECT MAX(price) INTO v_best_bid
    FROM orders
    WHERE instrument_id = p_instrument_id
      AND side = 'BUY'
      AND status IN ('OPEN', 'PARTIALLY_FILLED')
      AND remaining_quantity > 0;

    SELECT MIN(price) INTO v_best_ask
    FROM orders
    WHERE instrument_id = p_instrument_id
      AND side = 'SELL'
      AND status IN ('OPEN', 'PARTIALLY_FILLED')
      AND remaining_quantity > 0;

    IF v_best_bid IS NULL OR v_best_ask IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN v_best_ask - v_best_bid;
END$$

DELIMITER ;


-- =====================================================
-- FUNCTION 3: order_notional_value
-- Price × Quantity for a given order
-- =====================================================

DELIMITER $$

CREATE FUNCTION order_notional_value(p_order_id BIGINT)
RETURNS DECIMAL(18,4)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_val DECIMAL(18,4);

    SELECT price * quantity INTO v_val
    FROM orders WHERE order_id = p_order_id;

    RETURN COALESCE(v_val, 0);
END$$

DELIMITER ;


-- =====================================================
-- CURSOR: process_large_orders
-- Demonstrates cursor usage for batch processing
-- Flags orders with remaining_quantity > threshold
-- =====================================================

DELIMITER $$

CREATE PROCEDURE process_large_orders(
    IN p_threshold INT
)
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_order_id BIGINT;
    DECLARE v_remaining INT;
    DECLARE v_count INT DEFAULT 0;

    DECLARE cur_large CURSOR FOR
        SELECT order_id, remaining_quantity
        FROM orders
        WHERE remaining_quantity > p_threshold
          AND status IN ('OPEN', 'PARTIALLY_FILLED');

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur_large;

    read_loop: LOOP
        FETCH cur_large INTO v_order_id, v_remaining;

        IF done THEN
            LEAVE read_loop;
        END IF;

        -- Log large order for monitoring
        -- (In production, this would insert into an alerts table)
        SET v_count = v_count + 1;

    END LOOP;

    CLOSE cur_large;

    SELECT v_count AS large_orders_found;
END$$

DELIMITER ;


-- =====================================================
-- EXAMPLE USAGE
-- =====================================================

-- Place an order:
-- CALL place_order(1, 1, 'BUY', 'LIMIT', 150.0000, 100, 'idem-key-001');

-- Cancel an order:
-- CALL cancel_order(1);

-- Run matching for instrument 1:
-- CALL execute_matching(1);

-- Get VWAP:
-- SELECT get_vwap(1) AS vwap;

-- Get spread:
-- SELECT get_spread(1) AS current_spread;
