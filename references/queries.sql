USE lob_system;

SET SQL_SAFE_UPDATES = 0;

-- =====================================================
-- INSERT DATA
-- =====================================================

-- Instruments

INSERT INTO instruments(symbol,name,tick_size) VALUES
('AAPL','Apple Inc',0.01),
('GOOG','Alphabet Inc',0.01),
('MSFT','Microsoft',0.01),
('TSLA','Tesla',0.01),
('AMZN','Amazon',0.01),
('META','Meta Platforms',0.01),
('NFLX','Netflix',0.01),
('NVDA','Nvidia',0.01),
('BABA','Alibaba',0.01),
('ORCL','Oracle',0.01);


-- Traders

INSERT INTO traders(trader_name,email) VALUES
('Alice','alice@email.com'),
('Bob','bob@email.com'),
('Charlie','charlie@email.com'),
('David','david@email.com'),
('Eve','eve@email.com'),
('Frank','frank@email.com'),
('Grace','grace@email.com'),
('Helen','helen@email.com'),
('Ivan','ivan@email.com'),
('Jack','jack@email.com');


-- Orders

INSERT INTO orders(trader_id,instrument_id,side,price,quantity) VALUES
(1,1,'BUY',150,100),
(2,1,'SELL',151,50),
(3,2,'BUY',2800,10),
(4,3,'SELL',300,40),
(5,4,'BUY',700,30),
(6,5,'SELL',3300,5),
(7,6,'BUY',320,25),
(8,7,'SELL',450,15),
(9,8,'BUY',600,20),
(10,9,'SELL',200,60);


-- Order Events

INSERT INTO order_events(order_id,event_type,quantity,price) VALUES
(1,'ORDER_PLACED',100,150),
(2,'ORDER_PLACED',50,151),
(3,'ORDER_PLACED',10,2800),
(4,'ORDER_PLACED',40,300),
(5,'ORDER_PLACED',30,700),
(6,'ORDER_PLACED',5,3300),
(7,'ORDER_PLACED',25,320),
(8,'ORDER_PLACED',15,450),
(9,'ORDER_PLACED',20,600),
(10,'ORDER_PLACED',60,200);


-- Trades

INSERT INTO trades(buy_order_id,sell_order_id,price,quantity) VALUES
(1,2,150.5,50),
(3,4,2900,5),
(5,6,2000,2),
(7,8,400,10),
(9,10,250,20),
(1,4,151,10),
(3,6,3000,2),
(5,8,450,5),
(7,10,210,3),
(2,9,600,7);


-- =====================================================
-- UPDATE QUERIES
-- =====================================================

UPDATE orders
SET price = 152
WHERE order_id = 1;

UPDATE orders
SET quantity = quantity + 10
WHERE side = 'BUY';

UPDATE traders
SET trader_name = 'Alice Smith'
WHERE trader_id = 1;


-- =====================================================
-- DELETE QUERIES
-- =====================================================


-- Delete cancelled events
DELETE FROM order_events
WHERE event_type = 'ORDER_CANCELLED';


-- Delete dependent trades first
DELETE FROM trades
WHERE buy_order_id IN (
    SELECT * FROM (
        SELECT order_id FROM orders WHERE quantity < 10
    ) AS temp
)
OR sell_order_id IN (
    SELECT * FROM (
        SELECT order_id FROM orders WHERE quantity < 10
    ) AS temp
);


-- Delete related order events
DELETE FROM order_events
WHERE order_id IN (
    SELECT * FROM (
        SELECT order_id FROM orders WHERE quantity < 10
    ) AS temp
);


-- Finally delete the orders
DELETE FROM orders
WHERE quantity < 10;

-- =====================================================
-- SELECT QUERIES
-- =====================================================

-- Filtering
SELECT * FROM orders WHERE price > 500;

-- LIKE
SELECT * FROM traders WHERE trader_name LIKE 'A%';

-- IN
SELECT * FROM instruments WHERE symbol IN ('AAPL','TSLA','NVDA');

-- ORDER BY
SELECT * FROM orders ORDER BY price DESC;

-- Aggregation
SELECT COUNT(*) AS total_orders FROM orders;

-- GROUP BY with HAVING
SELECT side, SUM(quantity) AS total_qty
FROM orders
GROUP BY side
HAVING total_qty > 50;

-- JOIN
SELECT t.trader_name, o.price, o.quantity
FROM orders o
JOIN traders t ON o.trader_id = t.trader_id;

-- Subquery
SELECT * FROM orders
WHERE price > (
    SELECT AVG(price) FROM orders
);


-- =====================================================
-- VIEW OUTPUT
-- =====================================================

SELECT * FROM order_details;
SELECT * FROM market_depth;