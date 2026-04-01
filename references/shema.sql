-- =====================================================
-- DBMS PROJECT
-- Data Driven Limit Order Book System
-- Schema Creation using DDL
-- =====================================================

DROP DATABASE IF EXISTS lob_system;
CREATE DATABASE lob_system;
USE lob_system;


-- =====================================================
-- TABLE 1 : INSTRUMENTS
-- =====================================================

CREATE TABLE instruments (
    instrument_id INT AUTO_INCREMENT PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    tick_size DECIMAL(10,4) NOT NULL CHECK (tick_size > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =====================================================
-- TABLE 2 : TRADERS
-- =====================================================

CREATE TABLE traders (
    trader_id INT AUTO_INCREMENT PRIMARY KEY,
    trader_name VARCHAR(100) NOT NULL,
    email VARCHAR(120),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =====================================================
-- TABLE 3 : ORDERS
-- =====================================================

CREATE TABLE orders (
    order_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    trader_id INT NOT NULL,
    instrument_id INT NOT NULL,
    side ENUM('BUY','SELL') NOT NULL,
    price DECIMAL(12,4) NOT NULL CHECK (price > 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) DEFAULT 'OPEN',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (trader_id) REFERENCES traders(trader_id),
    FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id)
);


-- =====================================================
-- TABLE 4 : ORDER EVENTS
-- =====================================================

CREATE TABLE order_events (
    event_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    event_type ENUM(
        'ORDER_PLACED',
        'ORDER_PARTIALLY_FILLED',
        'ORDER_FILLED',
        'ORDER_CANCELLED'
    ) NOT NULL,
    quantity INT,
    price DECIMAL(12,4),
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);


-- =====================================================
-- TABLE 5 : TRADES
-- =====================================================

CREATE TABLE trades (
    trade_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    buy_order_id BIGINT NOT NULL,
    sell_order_id BIGINT NOT NULL,
    price DECIMAL(12,4) NOT NULL,
    quantity INT NOT NULL,
    trade_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (buy_order_id) REFERENCES orders(order_id),
    FOREIGN KEY (sell_order_id) REFERENCES orders(order_id)
);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_orders_instrument_side_price
ON orders(instrument_id, side, price);

CREATE INDEX idx_events_order_time
ON order_events(order_id, event_timestamp);


-- =====================================================
-- ALTER OPERATIONS
-- =====================================================

ALTER TABLE traders
ADD phone VARCHAR(20);

ALTER TABLE traders
MODIFY email VARCHAR(150);

ALTER TABLE traders
ADD CONSTRAINT unique_email UNIQUE(email);


-- =====================================================
-- VIEW (JOIN)
-- =====================================================

CREATE VIEW order_details AS
SELECT
    o.order_id,
    t.trader_name,
    i.symbol,
    o.side,
    o.price,
    o.quantity,
    o.status
FROM orders o
JOIN traders t ON o.trader_id = t.trader_id
JOIN instruments i ON o.instrument_id = i.instrument_id;


-- =====================================================
-- ANALYTICAL VIEW
-- =====================================================

CREATE VIEW market_depth AS
SELECT
    instrument_id,
    side,
    price,
    SUM(quantity) AS total_volume
FROM orders
GROUP BY instrument_id, side, price;