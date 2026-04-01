-- =====================================================
-- DBMS PROJECT — QuantLOB
-- Enhanced Schema v2 (Event-Sourced, CQRS-Ready)
-- =====================================================
-- KEY DESIGN PRINCIPLES:
--   1. Event sourcing: order_events is the source of truth
--   2. CQRS: orders.status and remaining_quantity are
--      derived read models maintained by triggers
--   3. ACID compliance via explicit transaction boundaries
--   4. 3NF+ with documented intentional denormalization
-- =====================================================

DROP DATABASE IF EXISTS lob_system;
CREATE DATABASE lob_system;
USE lob_system;


-- =====================================================
-- TABLE 1: INSTRUMENTS
-- Normalized reference table. No redundancy.
-- =====================================================

CREATE TABLE instruments (
    instrument_id   INT AUTO_INCREMENT PRIMARY KEY,
    symbol          VARCHAR(10)    NOT NULL UNIQUE,
    name            VARCHAR(100)   NOT NULL,
    tick_size       DECIMAL(10,4)  NOT NULL CHECK (tick_size > 0),
    lot_size        INT            NOT NULL DEFAULT 1 CHECK (lot_size > 0),
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- =====================================================
-- TABLE 2: TRADERS
-- Normalized reference table.
-- =====================================================

CREATE TABLE traders (
    trader_id       INT AUTO_INCREMENT PRIMARY KEY,
    trader_name     VARCHAR(100)   NOT NULL,
    email           VARCHAR(150)   UNIQUE,
    phone           VARCHAR(20),
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- =====================================================
-- TABLE 3: ORDERS
-- Core order table with CQRS-derived columns.
-- =====================================================
-- DESIGN NOTES:
--   - status is a DERIVED field maintained by triggers.
--     The canonical source of truth is order_events.
--   - remaining_quantity is a DERIVED field for fast
--     market depth queries without scanning events.
--   - order_type distinguishes LIMIT from MARKET orders.
--   - idempotency_key prevents duplicate submissions.
-- =====================================================

CREATE TABLE orders (
    order_id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    trader_id           INT            NOT NULL,
    instrument_id       INT            NOT NULL,
    side                ENUM('BUY','SELL') NOT NULL,
    order_type          ENUM('LIMIT','MARKET') NOT NULL DEFAULT 'LIMIT',
    price               DECIMAL(12,4)  NOT NULL CHECK (price > 0),
    quantity            INT            NOT NULL CHECK (quantity > 0),
    remaining_quantity  INT            NOT NULL,
    status              ENUM('OPEN','PARTIALLY_FILLED','FILLED','CANCELLED')
                            NOT NULL DEFAULT 'OPEN',
    idempotency_key     VARCHAR(64)    UNIQUE,
    created_at          DATETIME(6)    DEFAULT NOW(6),

    FOREIGN KEY (trader_id)     REFERENCES traders(trader_id),
    FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id)
) ENGINE=InnoDB;


-- =====================================================
-- TABLE 4: ORDER EVENTS (SOURCE OF TRUTH)
-- Append-only event log. NEVER updated or deleted.
-- =====================================================
-- DESIGN NOTES:
--   - This table IS the source of truth for all order state.
--   - remaining_after stores the order's remaining qty
--     AFTER this event, making each event self-describing.
--   - sequence_no provides unambiguous ordering when
--     timestamps collide (sub-microsecond events).
--   - event_timestamp uses DATETIME(6) for microsecond
--     precision, critical for time-travel queries.
-- =====================================================

CREATE TABLE order_events (
    event_id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id            BIGINT         NOT NULL,
    event_type          ENUM(
                            'ORDER_PLACED',
                            'ORDER_PARTIALLY_FILLED',
                            'ORDER_FILLED',
                            'ORDER_CANCELLED',
                            'ORDER_AMENDED',
                            'ORDER_EXPIRED',
                            'ORDER_REJECTED'
                        ) NOT NULL,
    quantity            INT,
    price               DECIMAL(12,4),
    remaining_after     INT,
    event_timestamp     DATETIME(6)    DEFAULT NOW(6),
    sequence_no         BIGINT         NOT NULL AUTO_INCREMENT UNIQUE,

    FOREIGN KEY (order_id) REFERENCES orders(order_id)
) ENGINE=InnoDB;

-- NOTE: MySQL does not allow AUTO_INCREMENT on non-primary.
-- Alternative: use a generated sequence or application-layer counter.
-- For academic purposes, we use event_id as the sequence proxy
-- since AUTO_INCREMENT on event_id already provides monotonic ordering.

-- CORRECTED VERSION (removing duplicate AUTO_INCREMENT):
ALTER TABLE order_events DROP COLUMN sequence_no;
-- event_id serves as the monotonic sequence number.


-- =====================================================
-- TABLE 5: TRADES
-- Immutable trade log. Intentionally denormalized with
-- instrument_id to avoid JOIN through orders for analytics.
-- =====================================================

CREATE TABLE trades (
    trade_id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    instrument_id       INT            NOT NULL,
    buy_order_id        BIGINT         NOT NULL,
    sell_order_id       BIGINT         NOT NULL,
    price               DECIMAL(12,4)  NOT NULL,
    quantity            INT            NOT NULL CHECK (quantity > 0),
    trade_timestamp     DATETIME(6)    DEFAULT NOW(6),

    FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id),
    FOREIGN KEY (buy_order_id)  REFERENCES orders(order_id),
    FOREIGN KEY (sell_order_id) REFERENCES orders(order_id)
) ENGINE=InnoDB;


-- =====================================================
-- TRIGGER: Set remaining_quantity on order insert
-- =====================================================

DELIMITER $$

CREATE TRIGGER trg_orders_before_insert
BEFORE INSERT ON orders
FOR EACH ROW
BEGIN
    -- Initialize remaining_quantity = quantity
    SET NEW.remaining_quantity = NEW.quantity;

    -- Validate price is positive (defense in depth)
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order price must be positive';
    END IF;

    -- Validate quantity is positive
    IF NEW.quantity <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order quantity must be positive';
    END IF;
END$$

DELIMITER ;


-- =====================================================
-- TRIGGER: Auto-generate ORDER_PLACED event
-- =====================================================

DELIMITER $$

CREATE TRIGGER trg_orders_after_insert
AFTER INSERT ON orders
FOR EACH ROW
BEGIN
    INSERT INTO order_events (order_id, event_type, quantity, price, remaining_after)
    VALUES (
        NEW.order_id,
        'ORDER_PLACED',
        NEW.quantity,
        NEW.price,
        NEW.quantity
    );
END$$

DELIMITER ;


-- =====================================================
-- TRIGGER: Update derived state on fill events
-- =====================================================
-- This trigger maintains the CQRS read model:
--   orders.remaining_quantity and orders.status
-- These are DERIVED from events, not sources of truth.
-- =====================================================

DELIMITER $$

CREATE TRIGGER trg_events_after_insert
AFTER INSERT ON order_events
FOR EACH ROW
BEGIN
    IF NEW.event_type IN ('ORDER_PARTIALLY_FILLED', 'ORDER_FILLED') THEN
        UPDATE orders
        SET remaining_quantity = remaining_quantity - NEW.quantity,
            status = CASE
                WHEN remaining_quantity - NEW.quantity = 0 THEN 'FILLED'
                ELSE 'PARTIALLY_FILLED'
            END
        WHERE order_id = NEW.order_id;
    ELSEIF NEW.event_type = 'ORDER_CANCELLED' THEN
        UPDATE orders
        SET status = 'CANCELLED'
        WHERE order_id = NEW.order_id;
    END IF;
END$$

DELIMITER ;


-- =====================================================
-- ALTER OPERATIONS (Demonstrating DDL proficiency)
-- =====================================================

-- Add a column for trader risk tier
ALTER TABLE traders ADD COLUMN risk_tier ENUM('LOW','MEDIUM','HIGH') DEFAULT 'LOW';

-- Modify email length (demonstrating ALTER MODIFY)
ALTER TABLE traders MODIFY email VARCHAR(200);

-- Add constraint for valid instrument tick sizes
ALTER TABLE instruments ADD CONSTRAINT chk_tick_size CHECK (tick_size >= 0.0001);


-- =====================================================
-- SCHEMA VERIFICATION QUERIES
-- =====================================================

-- Verify table structure
DESCRIBE instruments;
DESCRIBE traders;
DESCRIBE orders;
DESCRIBE order_events;
DESCRIBE trades;
