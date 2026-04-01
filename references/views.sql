-- =====================================================
-- DBMS PROJECT — QuantLOB
-- Views: Event-Sourced Order Book Reconstruction
-- =====================================================
-- All views derive state from order_events (source of truth).
-- The orders.remaining_quantity column is used for performance
-- but could be replaced by event-derived CTEs.
-- =====================================================

USE lob_system;


-- =====================================================
-- VIEW 1: order_details
-- JOIN across orders, traders, instruments + event state
-- =====================================================

CREATE OR REPLACE VIEW order_details AS
SELECT
    o.order_id,
    t.trader_name,
    i.symbol,
    o.side,
    o.order_type,
    o.price,
    o.quantity         AS original_quantity,
    o.remaining_quantity,
    o.status,
    o.created_at
FROM orders o
JOIN traders t      ON o.trader_id = t.trader_id
JOIN instruments i  ON o.instrument_id = i.instrument_id;


-- =====================================================
-- VIEW 2: live_market_depth
-- Correct event-sourced market depth
-- Uses remaining_quantity (CQRS read model maintained
-- by trigger, validated against events)
-- =====================================================

CREATE OR REPLACE VIEW live_market_depth AS
SELECT
    o.instrument_id,
    i.symbol,
    o.side,
    o.price,
    SUM(o.remaining_quantity)   AS total_volume,
    COUNT(*)                    AS order_count
FROM orders o
JOIN instruments i ON o.instrument_id = i.instrument_id
WHERE o.status IN ('OPEN', 'PARTIALLY_FILLED')
  AND o.remaining_quantity > 0
GROUP BY o.instrument_id, i.symbol, o.side, o.price
ORDER BY
    o.instrument_id,
    o.side,
    CASE WHEN o.side = 'BUY'  THEN -o.price  -- DESC for bids
         WHEN o.side = 'SELL' THEN  o.price   -- ASC for asks
    END;


-- =====================================================
-- VIEW 3: live_market_depth_verified
-- Pure event-sourced depth (no dependency on derived
-- remaining_quantity — reconstructs from events)
-- Use this to VERIFY the CQRS model is consistent.
-- =====================================================

CREATE OR REPLACE VIEW live_market_depth_verified AS
WITH remaining AS (
    SELECT
        o.order_id,
        o.instrument_id,
        o.side,
        o.price,
        o.quantity - COALESCE(SUM(
            CASE WHEN oe.event_type IN ('ORDER_PARTIALLY_FILLED','ORDER_FILLED')
                 THEN oe.quantity ELSE 0 END
        ), 0) AS remaining_qty,
        MAX(CASE WHEN oe.event_type = 'ORDER_CANCELLED' THEN 1 ELSE 0 END) AS is_cancelled
    FROM orders o
    LEFT JOIN order_events oe ON o.order_id = oe.order_id
    GROUP BY o.order_id, o.instrument_id, o.side, o.price, o.quantity
    HAVING remaining_qty > 0 AND is_cancelled = 0
)
SELECT
    r.instrument_id,
    i.symbol,
    r.side,
    r.price,
    SUM(r.remaining_qty)   AS total_volume,
    COUNT(*)               AS order_count
FROM remaining r
JOIN instruments i ON r.instrument_id = i.instrument_id
GROUP BY r.instrument_id, i.symbol, r.side, r.price
ORDER BY
    r.instrument_id,
    r.side,
    CASE WHEN r.side = 'BUY'  THEN -r.price
         WHEN r.side = 'SELL' THEN  r.price
    END;


-- =====================================================
-- VIEW 4: best_bid_ask
-- Current best bid, best ask, spread, and mid price
-- =====================================================

CREATE OR REPLACE VIEW best_bid_ask AS
WITH bid_ask AS (
    SELECT
        instrument_id,
        MAX(CASE WHEN side = 'BUY'  THEN price END) AS best_bid,
        MIN(CASE WHEN side = 'SELL' THEN price END) AS best_ask
    FROM orders
    WHERE status IN ('OPEN', 'PARTIALLY_FILLED')
      AND remaining_quantity > 0
    GROUP BY instrument_id
)
SELECT
    ba.instrument_id,
    i.symbol,
    ba.best_bid,
    ba.best_ask,
    (ba.best_ask - ba.best_bid)                                        AS absolute_spread,
    ROUND((ba.best_ask - ba.best_bid) /
          ((ba.best_ask + ba.best_bid) / 2) * 100, 4)                 AS spread_pct,
    ROUND((ba.best_ask + ba.best_bid) / 2, 4)                         AS mid_price
FROM bid_ask ba
JOIN instruments i ON ba.instrument_id = i.instrument_id;


-- =====================================================
-- VIEW 5: order_lifecycle
-- Full lifecycle of each order from events
-- Uses window functions for first/last event times
-- =====================================================

CREATE OR REPLACE VIEW order_lifecycle AS
SELECT
    o.order_id,
    t.trader_name,
    i.symbol,
    o.side,
    o.price,
    o.quantity           AS original_qty,
    o.remaining_quantity AS remaining_qty,
    o.status,
    MIN(oe.event_timestamp) AS placed_at,
    MAX(oe.event_timestamp) AS last_event_at,
    TIMESTAMPDIFF(
        MICROSECOND,
        MIN(oe.event_timestamp),
        MAX(oe.event_timestamp)
    ) / 1000000.0            AS lifetime_seconds,
    COUNT(oe.event_id)       AS event_count
FROM orders o
JOIN traders t       ON o.trader_id = t.trader_id
JOIN instruments i   ON o.instrument_id = i.instrument_id
LEFT JOIN order_events oe ON o.order_id = oe.order_id
GROUP BY
    o.order_id, t.trader_name, i.symbol,
    o.side, o.price, o.quantity, o.remaining_quantity, o.status;


-- =====================================================
-- VIEW 6: trade_summary
-- Recent trades with instrument and trader info
-- =====================================================

CREATE OR REPLACE VIEW trade_summary AS
SELECT
    tr.trade_id,
    i.symbol,
    tr.price,
    tr.quantity,
    tr.price * tr.quantity       AS notional_value,
    tr.trade_timestamp,
    tb.trader_name               AS buyer,
    ts.trader_name               AS seller
FROM trades tr
JOIN instruments i    ON tr.instrument_id = i.instrument_id
JOIN orders ob        ON tr.buy_order_id  = ob.order_id
JOIN orders os        ON tr.sell_order_id = os.order_id
JOIN traders tb       ON ob.trader_id     = tb.trader_id
JOIN traders ts       ON os.trader_id     = ts.trader_id
ORDER BY tr.trade_timestamp DESC;


-- =====================================================
-- VIEW 7: cqrs_consistency_check
-- Validates CQRS model: compares trigger-maintained
-- remaining_quantity vs event-derived remaining.
-- Rows returned = inconsistencies (should be ZERO).
-- =====================================================

CREATE OR REPLACE VIEW cqrs_consistency_check AS
WITH event_derived AS (
    SELECT
        o.order_id,
        o.remaining_quantity AS cqrs_remaining,
        o.quantity - COALESCE(SUM(
            CASE WHEN oe.event_type IN ('ORDER_PARTIALLY_FILLED','ORDER_FILLED')
                 THEN oe.quantity ELSE 0 END
        ), 0) AS event_remaining
    FROM orders o
    LEFT JOIN order_events oe ON o.order_id = oe.order_id
    GROUP BY o.order_id, o.quantity, o.remaining_quantity
)
SELECT *
FROM event_derived
WHERE cqrs_remaining != event_remaining;

-- USAGE: SELECT * FROM cqrs_consistency_check;
-- Expected result: EMPTY (no inconsistencies)
