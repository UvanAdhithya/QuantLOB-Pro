USE lob_system;

-- =====================================================
-- PART 1: JOINS
-- =====================================================

-- 1. INNER JOIN
SELECT 
    o.order_id,
    t.trader_name,
    o.side,
    o.price,
    o.quantity
FROM orders o
INNER JOIN traders t 
    ON o.trader_id = t.trader_id;


-- 2. LEFT JOIN
SELECT 
    o.order_id,
    o.side,
    e.event_type
FROM orders o
LEFT JOIN order_events e 
    ON o.order_id = e.order_id;


-- 3. JOIN with 3 tables
SELECT 
    t.trader_name,
    i.symbol,
    o.side,
    o.price,
    o.quantity
FROM orders o
JOIN traders t 
    ON o.trader_id = t.trader_id
JOIN instruments i 
    ON o.instrument_id = i.instrument_id;


-- 4. JOIN with condition
SELECT 
    i.symbol,
    o.side,
    o.price,
    o.quantity
FROM orders o
JOIN instruments i 
    ON o.instrument_id = i.instrument_id
WHERE o.price > 500;


-- 5. JOIN + Aggregate
SELECT 
    i.symbol,
    SUM(o.quantity) AS total_volume
FROM orders o
JOIN instruments i 
    ON o.instrument_id = i.instrument_id
GROUP BY i.symbol;


-- =====================================================
-- PART 2: AGGREGATE FUNCTIONS
-- =====================================================

-- COUNT
SELECT COUNT(*) AS total_orders FROM orders;

-- SUM + GROUP BY
SELECT side, SUM(quantity) AS total_qty
FROM orders
GROUP BY side;

-- AVG
SELECT AVG(price) AS avg_price FROM orders;

-- MIN / MAX
SELECT 
    MIN(price) AS min_price,
    MAX(price) AS max_price
FROM orders;

-- GROUP BY + HAVING
SELECT instrument_id, SUM(quantity) AS total_qty
FROM orders
GROUP BY instrument_id
HAVING total_qty > 50;

-- Aggregate with JOIN
SELECT 
    t.trader_name,
    SUM(o.quantity) AS total_volume
FROM orders o
JOIN traders t 
    ON o.trader_id = t.trader_id
GROUP BY t.trader_name;


-- =====================================================
-- PART 3: SET OPERATIONS
-- =====================================================

-- UNION
SELECT trader_id FROM orders WHERE side = 'BUY'
UNION
SELECT trader_id FROM orders WHERE side = 'SELL';


-- INTERSECT (simulated)
SELECT trader_id FROM orders 
WHERE side = 'BUY'
AND trader_id IN (
    SELECT trader_id FROM orders WHERE side = 'SELL'
);


-- EXCEPT / MINUS (simulated)
SELECT trader_id FROM orders 
WHERE side = 'BUY'
AND trader_id NOT IN (
    SELECT trader_id FROM orders WHERE side = 'SELL'
);


-- =====================================================
-- PART 4: PROJECT-BASED QUERIES (LOB LOGIC)
-- =====================================================

-- 1. MARKET DEPTH (Order Book)
SELECT 
    instrument_id,
    side,
    price,
    SUM(quantity) AS total_volume
FROM orders
GROUP BY instrument_id, side, price
ORDER BY instrument_id, price DESC;


-- 2. VWAP (Volume Weighted Avg Price)
SELECT 
    SUM(price * quantity) / SUM(quantity) AS vwap
FROM trades;


-- 3. TOP TRADERS (by traded volume)
SELECT 
    t.trader_name,
    SUM(tr.quantity) AS total_traded_volume
FROM trades tr
JOIN orders o 
    ON tr.buy_order_id = o.order_id
JOIN traders t 
    ON o.trader_id = t.trader_id
GROUP BY t.trader_name
ORDER BY total_traded_volume DESC;


-- 4. ORDER LIFETIME (event-based)
SELECT 
    o.order_id,
    MIN(e.event_timestamp) AS placed_time,
    MAX(e.event_timestamp) AS last_event_time
FROM orders o
JOIN order_events e 
    ON o.order_id = e.order_id
GROUP BY o.order_id;


-- 5. BID-ASK SPREAD
WITH best_bid AS (
    SELECT MAX(price) AS bid FROM orders WHERE side = 'BUY'
),
best_ask AS (
    SELECT MIN(price) AS ask FROM orders WHERE side = 'SELL'
)
SELECT 
    best_bid.bid,
    best_ask.ask,
    (best_ask.ask - best_bid.bid) AS spread
FROM best_bid, best_ask;