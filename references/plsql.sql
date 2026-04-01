-- =========================================
-- PL/SQL ASSIGNMENT - LOB PROJECT
-- =========================================

-- =========================
-- PART 1: PROCEDURES
-- =========================

DELIMITER $$

CREATE PROCEDURE update_order_price(
    IN p_order_id BIGINT,
    IN p_new_price DECIMAL(12,4)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
    END;

    START TRANSACTION;

    UPDATE orders
    SET price = p_new_price
    WHERE order_id = p_order_id;

    INSERT INTO order_events(order_id, event_type, price)
    VALUES(p_order_id, 'ORDER_UPDATED', p_new_price);

    COMMIT;
END$$


CREATE PROCEDURE calculate_total_volume(
    IN p_instrument_id INT,
    OUT total_volume INT
)
BEGIN
    SELECT SUM(quantity)
    INTO total_volume
    FROM orders
    WHERE instrument_id = p_instrument_id;
END$$

DELIMITER ;

-- =========================
-- PART 2: FUNCTIONS
-- =========================

DELIMITER $$

CREATE FUNCTION get_avg_price(p_instrument_id INT)
RETURNS DECIMAL(12,4)
DETERMINISTIC
BEGIN
    DECLARE avg_price DECIMAL(12,4);

    SELECT AVG(price)
    INTO avg_price
    FROM orders
    WHERE instrument_id = p_instrument_id;

    RETURN avg_price;
END$$


CREATE FUNCTION order_value(p_order_id BIGINT)
RETURNS DECIMAL(12,4)
DETERMINISTIC
BEGIN
    DECLARE val DECIMAL(12,4);

    SELECT price * quantity
    INTO val
    FROM orders
    WHERE order_id = p_order_id;

    RETURN val;
END$$

DELIMITER ;

-- Example usage in SELECT:
-- SELECT order_id, order_value(order_id) FROM orders;

-- =========================
-- PART 3: CURSOR
-- =========================

DELIMITER $$

CREATE PROCEDURE process_large_orders()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_order_id BIGINT;
    DECLARE v_qty INT;

    DECLARE cur CURSOR FOR
        SELECT order_id, quantity FROM orders WHERE quantity > 50;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;

    loop_orders: LOOP
        FETCH cur INTO v_order_id, v_qty;

        IF done THEN
            LEAVE loop_orders;
        END IF;

        UPDATE orders
        SET status = 'LARGE'
        WHERE order_id = v_order_id;

    END LOOP;

    CLOSE cur;
END$$

DELIMITER ;

-- =========================
-- PART 4: TRIGGERS
-- =========================

DELIMITER $$

CREATE TRIGGER before_order_insert
BEFORE INSERT ON orders
FOR EACH ROW
BEGIN
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Price must be positive';
    END IF;
END$$


CREATE TRIGGER after_order_insert
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
    INSERT INTO order_events(order_id, event_type, quantity, price)
    VALUES(NEW.order_id, 'ORDER_PLACED', NEW.quantity, NEW.price);
END$$

DELIMITER ;

-- =========================================
-- END OF FILE
-- =========================================
