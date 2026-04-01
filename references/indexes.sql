-- =====================================================
-- DBMS PROJECT — QuantLOB
-- Comprehensive Indexing Strategy
-- =====================================================
-- INDEX DESIGN PRINCIPLES:
--   1. Equality columns first, range/sort columns after
--   2. Covering indexes where possible (avoid table access)
--   3. Balanced read/write trade-off for LOB workloads
-- =====================================================

USE lob_system;


-- ═══════════════════════════════════════════════════════
-- INDEX 1: Primary order book lookup
-- ═══════════════════════════════════════════════════════
-- Covers: market depth queries, best bid/ask, matching
-- Column order rationale:
--   instrument_id → equality (= X)
--   side          → equality (= 'BUY' or 'SELL')
--   status        → equality (IN ('OPEN','PARTIALLY_FILLED'))
--   price         → range   (ORDER BY DESC/ASC)
--   created_at    → sort    (FIFO tiebreaker at same price)
--
-- Query plan: type=range, key=idx_orders_book_lookup
-- InnoDB traverses: instrument → side → status → price (sorted)
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_orders_book_lookup
ON orders(instrument_id, side, status, price, created_at);


-- ═══════════════════════════════════════════════════════
-- INDEX 2: Event fill aggregation (COVERING)
-- ═══════════════════════════════════════════════════════
-- Covers: remaining_qty subquery
--   SELECT SUM(quantity) FROM order_events
--   WHERE order_id = ? AND event_type IN (...)
--
-- This is a covering index — InnoDB answers the query
-- entirely from the index without accessing the table.
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_events_fill_aggregation
ON order_events(order_id, event_type, quantity);


-- ═══════════════════════════════════════════════════════
-- INDEX 3: Time-travel queries
-- ═══════════════════════════════════════════════════════
-- Covers: event_timestamp <= @target_time range scans
-- Column order:
--   event_timestamp → range filter
--   order_id        → JOIN key
--   event_type      → covering (avoids table lookup)
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_events_time_travel
ON order_events(event_timestamp, order_id, event_type);


-- ═══════════════════════════════════════════════════════
-- INDEX 4: Order event timeline (lifecycle queries)
-- ═══════════════════════════════════════════════════════
-- Covers: MIN/MAX(event_timestamp) GROUP BY order_id
-- Enables index-only scan for order lifetime queries
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_events_order_timeline
ON order_events(order_id, event_timestamp);


-- ═══════════════════════════════════════════════════════
-- INDEX 5: Event type analytics
-- ═══════════════════════════════════════════════════════
-- Covers: event_type frequency, cancellation rate
--   SELECT event_type, COUNT(*) ... GROUP BY event_type
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_events_type_timestamp
ON order_events(event_type, event_timestamp);


-- ═══════════════════════════════════════════════════════
-- INDEX 6: Trade analytics — by instrument + time
-- ═══════════════════════════════════════════════════════
-- Covers: VWAP, trade volume, candlestick generation
--   SELECT SUM(price*quantity)/SUM(quantity)
--   FROM trades WHERE instrument_id = ? AND trade_timestamp BETWEEN ...
--
-- Covering: includes price and quantity so VWAP
-- can be computed without touching the table.
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_trades_instrument_analytics
ON trades(instrument_id, trade_timestamp, price, quantity);


-- ═══════════════════════════════════════════════════════
-- INDEX 7: Trade lookup by buy order
-- ═══════════════════════════════════════════════════════
-- Covers: "find all trades for a given buy order"
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_trades_buy_order
ON trades(buy_order_id, trade_timestamp);


-- ═══════════════════════════════════════════════════════
-- INDEX 8: Trade lookup by sell order
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_trades_sell_order
ON trades(sell_order_id, trade_timestamp);


-- ═══════════════════════════════════════════════════════
-- INDEX 9: Trader portfolio queries
-- ═══════════════════════════════════════════════════════
-- Covers: "show all orders for trader X in instrument Y"
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_orders_trader_portfolio
ON orders(trader_id, instrument_id, status);


-- ═══════════════════════════════════════════════════════
-- INDEX 10: Remaining quantity filter
-- ═══════════════════════════════════════════════════════
-- Used by matching engine: find active orders with
-- remaining_quantity > 0
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_orders_active_remaining
ON orders(instrument_id, side, remaining_quantity, price, created_at);


-- =====================================================
-- READ vs WRITE TRADE-OFF ANALYSIS
-- =====================================================
-- ┌──────────────────────────────────┬───────────────┬────────────────┐
-- │ Index                            │ Read Benefit  │ Write Cost     │
-- ├──────────────────────────────────┼───────────────┼────────────────┤
-- │ idx_orders_book_lookup (5 cols)  │ Covers all    │ ~2× write amp  │
-- │                                  │ book queries  │ on orders INS  │
-- ├──────────────────────────────────┼───────────────┼────────────────┤
-- │ idx_events_fill_aggregation      │ Covering for  │ 1 B-tree entry │
-- │ (3 cols)                         │ remaining_qty │ per event      │
-- ├──────────────────────────────────┼───────────────┼────────────────┤
-- │ idx_events_time_travel (3 cols)  │ Range scan    │ 1 B-tree entry │
-- │                                  │ for replay    │ per event      │
-- ├──────────────────────────────────┼───────────────┼────────────────┤
-- │ idx_trades_instrument_analytics  │ VWAP, candles │ 1 entry/trade  │
-- │ (4 cols, covering)              │ index-only    │                │
-- └──────────────────────────────────┴───────────────┴────────────────┘
--
-- VERDICT: In a LOB system, reads (book depth queries at
-- 100ms–1s intervals) heavily outnumber writes. The write
-- amplification from 10 indexes is acceptable.
-- =====================================================


-- =====================================================
-- EXPECTED EXPLAIN PLANS
-- =====================================================

-- Market Depth Query:
-- EXPLAIN SELECT ... FROM orders WHERE instrument_id=1 AND side='BUY' AND status IN ('OPEN','PARTIALLY_FILLED')
-- Expected:
--   type: range
--   key:  idx_orders_book_lookup
--   rows: N (active orders for this instrument+side)
--   Extra: Using index condition

-- Time-Travel Query:
-- EXPLAIN SELECT ... FROM order_events WHERE event_timestamp <= '2026-04-01 14:30:00'
-- Expected:
--   type: range
--   key:  idx_events_time_travel
--   rows: E_T (events before timestamp T)
--   Extra: Using index condition

-- VWAP Query:
-- EXPLAIN SELECT SUM(price*quantity)/SUM(quantity) FROM trades WHERE instrument_id=1
-- Expected:
--   type: ref
--   key:  idx_trades_instrument_analytics
--   Extra: Using index (covering — no table access)
