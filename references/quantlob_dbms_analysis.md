# QuantLOB — DBMS-Focused Event-Sourced Limit Order Book Analysis

---

## PART 1 — REPO ANALYSIS

---

### Repo A: `khrapovs/OrderBookMatchingEngine` (Python)

**Architecture**

| Layer | Implementation |
|---|---|
| Data structures | `OrderBook` class with `bids: dict[float, Orders]` and `offers: dict[float, Orders]` — entirely in-memory, `defaultdict`-backed |
| Matching | `MatchingEngine.match()` — price-time priority. Iterates sorted opposite-side prices, executes trades by consuming `size` from both incoming and book orders |
| Order model | `@dataclass Order` with fields: `side`, `price`, `size`, `timestamp`, `order_id`, `trader_id`, `execution` (LIMIT/MARKET), `expiration`, `status` (OPEN/CANCEL) |
| Trade model | `@dataclass Trade` with: `side`, `price`, `size`, `incoming_order_id`, `book_order_id`, `execution`, `trade_id`, `timestamp` |
| Persistence | **None.** Zero database interaction. All state lives in Python dicts |
| Output | `ExecutedTrades` object + pandas DataFrames via `summary()` |

**Data Flow**

```
Orders([LimitOrder, ...])
        │
        ▼
MatchingEngine.match(timestamp)
        │
        ├──→ Queue incoming orders
        ├──→ Check expired orders → auto-cancel
        ├──→ For each queued order:
        │     ├── CANCEL? → remove from book
        │     ├── Match exists? → _execute_trades()
        │     │     ├── iterate sorted prices
        │     │     ├── consume min(incoming.size, book.size)
        │     │     ├── create Trade dataclass
        │     │     └── if remaining size > 0, append to book
        │     └── No match? → append to book
        │
        ▼
ExecutedTrades(trades=[Trade, ...])
```

**DBMS Limitations**

1. **No persistence at all** — state vanishes on process restart
2. **No event log** — order mutations (`size` decremented in-place) are destructive; no audit trail
3. **No transaction semantics** — concurrent access would corrupt `bids`/`offers` dicts
4. **Status enum only has OPEN/CANCEL** — no PARTIALLY_FILLED/FILLED states
5. **No instrument/symbol concept** — single-book engine
6. **Float arithmetic** — prices stored as Python floats, not fixed-precision decimals
7. **No idempotency** — replaying the same order produces duplicate trades

**Useful Components for DB-Centric System**

| Component | Value for your project |
|---|---|
| Price-time priority algorithm | Correct matching logic to validate your SQL reconstruction against |
| `Trade` dataclass fields | Maps directly to your `trades` table (`incoming_order_id` → `buy/sell_order_id`, `size` → `quantity`) |
| `OrderBook.summary()` | Aggregates price levels with count — mirrors your `market_depth` view |
| `get_imbalance()` formula | `(Σbid - Σask) / (Σbid + Σask)` — use in your analytical queries |
| Expiration handling | Design pattern worth encoding as `ORDER_EXPIRED` event type |

---

### Repo B: `jose-donato/crypto-orderbook` (Go + React/Vite)

**Architecture**

| Layer | Implementation |
|---|---|
| Backend | Go server connects to exchange WebSocket APIs (Binance, Coinbase, Kraken), normalizes data, proxies to frontend via WebSocket |
| Frontend | React + Vite. Renders order book depth, trade tape, spread indicators. Connects to Go backend WebSocket |
| Data model | In-transit only — no persistence. Order book is a snapshot array `{price, quantity, side}[]` refreshed per WebSocket message |
| State management | React state (`useState`) — book replaced entirely on each WebSocket frame |

**DBMS Limitations**

1. **Zero persistence** — pure pass-through proxy
2. **No event history** — each WebSocket frame replaces the previous; no time-series storage
3. **No order identity** — book levels are anonymous aggregates, not individual orders
4. **No matching engine** — reads from exchange, does not process orders
5. **No trade generation** — trades are received, not generated

**Useful Components for DB-Centric System**

| Component | Value for your project |
|---|---|
| React order book renderer | Your `OrderBook.jsx` already mirrors this — depth bars, bid/ask coloring, spread row |
| WebSocket protocol pattern | Model your DB → frontend push layer on this: send `{type: "book_snapshot", data: {...}}` messages |
| Multi-exchange symbol selector | Maps to your `instruments` table — use dropdown to switch `instrument_id` |
| Depth visualization | Horizontal fill bars proportional to `qty/max_qty` — already in your codebase |

---

## PART 2 — MAPPING TO YOUR DB DESIGN

---

### Concept Mapping

| Matching Engine Concept | Your Table | Column Mapping |
|---|---|---|
| `Order.order_id` | `orders.order_id` | `BIGINT AUTO_INCREMENT` |
| `Order.trader_id` | `orders.trader_id` → `traders.trader_id` | FK relationship |
| `Order.side` (BUY/SELL) | `orders.side` | `ENUM('BUY','SELL')` |
| `Order.price` (float) | `orders.price` | `DECIMAL(12,4)` — **superior to float** |
| `Order.size` (mutable) | `orders.quantity` (original) + derived `remaining_quantity` | See improvement in Part 7 |
| `Order.status` (OPEN/CANCEL) | `orders.status` | Extended to `VARCHAR(20)` |
| `Order.execution` (LIMIT/MARKET) | **Missing in your schema** | See Part 7 |
| `Order.timestamp` | `orders.created_at` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` |
| `Trade.trade_id` | `trades.trade_id` | `BIGINT AUTO_INCREMENT` |
| `Trade.incoming_order_id` | `trades.buy_order_id` or `trades.sell_order_id` | Depends on trade side |
| `Trade.book_order_id` | The other of `buy/sell_order_id` | |
| `Trade.size` | `trades.quantity` | `INT` |
| `Trade.price` | `trades.price` | `DECIMAL(12,4)` |
| `OrderBook.summary()` | `market_depth` VIEW | Aggregates by `(instrument_id, side, price)` |
| `get_imbalance()` | Custom analytical query | `(SUM(bid_qty) - SUM(ask_qty)) / (SUM(bid_qty) + SUM(ask_qty))` |
| **No equivalent** | `order_events` | **Your key innovation — event sourcing** |
| **No equivalent** | `instruments` | **Your multi-instrument design** |

---

### Converting In-Memory Match to Event-Sourced DB Inserts

The matching engine's `_execute_trade()` performs destructive mutation:

```python
# In-memory (khrapovs) — DESTRUCTIVE
incoming_order.size = max(0.0, incoming_order.size - trade.size)
book_order.size = max(0.0, book_order.size - trade.size)
```

**Your DB equivalent must be event-driven — never mutate, always append:**

```sql
-- STEP 1: Insert the trade
INSERT INTO trades (buy_order_id, sell_order_id, price, quantity)
VALUES (@buy_id, @sell_id, @exec_price, @exec_qty);

-- STEP 2: Emit fill events for BOTH sides
-- For the buy order:
INSERT INTO order_events (order_id, event_type, quantity, price)
VALUES (
    @buy_id,
    CASE
        WHEN @buy_remaining - @exec_qty = 0 THEN 'ORDER_FILLED'
        ELSE 'ORDER_PARTIALLY_FILLED'
    END,
    @exec_qty,
    @exec_price
);

-- For the sell order:
INSERT INTO order_events (order_id, event_type, quantity, price)
VALUES (
    @sell_id,
    CASE
        WHEN @sell_remaining - @exec_qty = 0 THEN 'ORDER_FILLED'
        ELSE 'ORDER_PARTIALLY_FILLED'
    END,
    @exec_qty,
    @exec_price
);

-- STEP 3: Update derived state (orders.status) for fast reads
UPDATE orders SET status = CASE
    WHEN order_id = @buy_id AND @buy_remaining - @exec_qty = 0 THEN 'FILLED'
    WHEN order_id = @buy_id THEN 'PARTIALLY_FILLED'
    WHEN order_id = @sell_id AND @sell_remaining - @exec_qty = 0 THEN 'FILLED'
    WHEN order_id = @sell_id THEN 'PARTIALLY_FILLED'
END
WHERE order_id IN (@buy_id, @sell_id);
```

> The `orders.status` UPDATE is a **derived state optimization**, not the source of truth. The source of truth is the `order_events` table. Any status can be reconstructed by replaying events.

---

## PART 3 — EVENT-SOURCED PIPELINE DESIGN

---

### Pipeline Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  ORDER INGESTION │────▶│  EVENT CREATION   │────▶│  TRADE GENERATION  │
│  (HTTP/API)      │     │  (ORDER_PLACED)   │     │  (matching logic)  │
└─────────────────┘     └──────────────────┘     └────────────────────┘
                                                           │
                              ┌─────────────────────────────┘
                              ▼
                    ┌──────────────────┐     ┌──────────────────┐
                    │  FILL EVENTS     │────▶│  STATE UPDATE     │
                    │  PARTIALLY_FILLED│     │  (derived tables)  │
                    │  FILLED          │     └──────────────────┘
                    └──────────────────┘
```

---

### Stage 1: Order Ingestion

```sql
DELIMITER $$
CREATE PROCEDURE place_order(
    IN p_trader_id    INT,
    IN p_instrument_id INT,
    IN p_side         ENUM('BUY','SELL'),
    IN p_price        DECIMAL(12,4),
    IN p_quantity     INT,
    IN p_idempotency_key VARCHAR(64)
)
BEGIN
    DECLARE v_order_id BIGINT;
    DECLARE v_existing BIGINT DEFAULT NULL;

    -- Idempotency check
    SELECT order_id INTO v_existing
    FROM orders WHERE idempotency_key = p_idempotency_key LIMIT 1;

    IF v_existing IS NOT NULL THEN
        SELECT v_existing AS order_id, 'DUPLICATE' AS status;
        -- Return early — no new order
    ELSE
        START TRANSACTION;

        -- Insert order (source of truth: events will follow)
        INSERT INTO orders (trader_id, instrument_id, side, price, quantity, status, idempotency_key)
        VALUES (p_trader_id, p_instrument_id, p_side, p_price, p_quantity, 'OPEN', p_idempotency_key);

        SET v_order_id = LAST_INSERT_ID();

        -- Emit ORDER_PLACED event
        INSERT INTO order_events (order_id, event_type, quantity, price)
        VALUES (v_order_id, 'ORDER_PLACED', p_quantity, p_price);

        COMMIT;

        SELECT v_order_id AS order_id, 'PLACED' AS status;
    END IF;
END$$
DELIMITER ;
```

---

### Stage 2: Event Creation Rules

| Triggering Action | Event Type | Quantity Meaning | Price Meaning |
|---|---|---|---|
| New order submitted | `ORDER_PLACED` | Original order qty | Limit price |
| Partial match found | `ORDER_PARTIALLY_FILLED` | Executed qty this fill | Execution price |
| Final fill exhausting remaining qty | `ORDER_FILLED` | Executed qty this fill | Execution price |
| User/system cancellation | `ORDER_CANCELLED` | Remaining qty at cancel time | Last known price |

---

### Stage 3: Trade Generation (DB-Driven Matching)

```sql
DELIMITER $$
CREATE PROCEDURE execute_matching(
    IN p_instrument_id INT
)
proc_body: BEGIN
    DECLARE v_buy_id BIGINT;
    DECLARE v_sell_id BIGINT;
    DECLARE v_buy_price DECIMAL(12,4);
    DECLARE v_sell_price DECIMAL(12,4);
    DECLARE v_buy_remaining INT;
    DECLARE v_sell_remaining INT;
    DECLARE v_exec_qty INT;
    DECLARE v_exec_price DECIMAL(12,4);

    -- Find best bid (highest BUY price)
    SELECT order_id, price,
           quantity - COALESCE((
               SELECT SUM(oe.quantity)
               FROM order_events oe
               WHERE oe.order_id = o.order_id
               AND oe.event_type IN ('ORDER_PARTIALLY_FILLED','ORDER_FILLED')
           ), 0) AS remaining
    INTO v_buy_id, v_buy_price, v_buy_remaining
    FROM orders o
    WHERE instrument_id = p_instrument_id
      AND side = 'BUY'
      AND status IN ('OPEN','PARTIALLY_FILLED')
    ORDER BY price DESC, created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF v_buy_id IS NULL THEN
        LEAVE proc_body;
    END IF;

    -- Find best ask (lowest SELL price) that crosses
    SELECT order_id, price,
           quantity - COALESCE((
               SELECT SUM(oe.quantity)
               FROM order_events oe
               WHERE oe.order_id = o.order_id
               AND oe.event_type IN ('ORDER_PARTIALLY_FILLED','ORDER_FILLED')
           ), 0) AS remaining
    INTO v_sell_id, v_sell_price, v_sell_remaining
    FROM orders o
    WHERE instrument_id = p_instrument_id
      AND side = 'SELL'
      AND status IN ('OPEN','PARTIALLY_FILLED')
      AND price <= v_buy_price
    ORDER BY price ASC, created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF v_sell_id IS NULL THEN
        LEAVE proc_body;
    END IF;

    -- Execute: price-time priority → passive order's price
    SET v_exec_price = v_sell_price;  -- Resting order determines price
    SET v_exec_qty = LEAST(v_buy_remaining, v_sell_remaining);

    START TRANSACTION;

    -- Insert trade
    INSERT INTO trades (buy_order_id, sell_order_id, price, quantity)
    VALUES (v_buy_id, v_sell_id, v_exec_price, v_exec_qty);

    -- Emit buy-side fill event
    INSERT INTO order_events (order_id, event_type, quantity, price)
    VALUES (v_buy_id,
            IF(v_buy_remaining - v_exec_qty = 0, 'ORDER_FILLED', 'ORDER_PARTIALLY_FILLED'),
            v_exec_qty, v_exec_price);

    -- Emit sell-side fill event
    INSERT INTO order_events (order_id, event_type, quantity, price)
    VALUES (v_sell_id,
            IF(v_sell_remaining - v_exec_qty = 0, 'ORDER_FILLED', 'ORDER_PARTIALLY_FILLED'),
            v_exec_qty, v_exec_price);

    -- Update derived status
    UPDATE orders SET status = IF(v_buy_remaining - v_exec_qty = 0, 'FILLED', 'PARTIALLY_FILLED')
    WHERE order_id = v_buy_id;

    UPDATE orders SET status = IF(v_sell_remaining - v_exec_qty = 0, 'FILLED', 'PARTIALLY_FILLED')
    WHERE order_id = v_sell_id;

    COMMIT;
END$$
DELIMITER ;
```

---

### Transaction Boundaries

| Operation | Transaction Scope | Rationale |
|---|---|---|
| Order placement | Single TX: `INSERT orders` + `INSERT order_events` | Atomic: an order without its PLACED event is an anomaly |
| Single match execution | Single TX: `INSERT trades` + 2× `INSERT order_events` + 2× `UPDATE orders` | Atomic: a trade must always have corresponding fill events |
| Batch matching | Loop of single-match TXs | Each match is independent; failing one must not roll back others |
| Cancellation | Single TX: `INSERT order_events(CANCELLED)` + `UPDATE orders.status` | Atomic |

---

### Isolation Level Discussion

| Level | Trade-off | Recommendation |
|---|---|---|
| `READ UNCOMMITTED` | Risk of dirty reads — a partially-committed trade could be visible. **Unacceptable.** | Never |
| `READ COMMITTED` | Adequate for read-heavy queries (analytics, market depth views). No dirty reads. Possible non-repeatable reads within a long analytical query. | **Use for read paths** |
| `REPEATABLE READ` (MySQL/InnoDB default) | Prevents non-repeatable reads. Uses snapshot isolation via MVCC. **Ideal for matching** — ensures the order book state read at TX start is stable through the match. | **Use for matching TXs** |
| `SERIALIZABLE` | Prevents phantom reads. Would serialize all matching operations. Throughput bottleneck. | Only if multiple matching engines exist (unlikely in this architecture) |

**Recommended Configuration:**

```sql
-- Matching engine session
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- Read-only analytics session
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

---

### Concurrency Handling

**Risk: Two concurrent matching processes both claim the same best bid.**

**Solution: Pessimistic locking with `SELECT ... FOR UPDATE`**

```sql
SELECT order_id, price, ...
FROM orders
WHERE instrument_id = @inst AND side = 'BUY' AND status IN ('OPEN','PARTIALLY_FILLED')
ORDER BY price DESC, created_at ASC
LIMIT 1
FOR UPDATE;
-- This row is now locked. Any concurrent matcher will BLOCK here.
```

The `FOR UPDATE` clause acquires an exclusive row-level lock in InnoDB. A second concurrent matching process attempting `SELECT ... FOR UPDATE` on the same row will block until the first TX commits or rolls back.

**Deadlock prevention:** Always acquire locks in a consistent order — `BUY` side first, then `SELL` side. This prevents circular wait conditions.

---

### Idempotency Strategy

**Problem:** Network retries or application restarts may re-submit the same order.

**Solution:** Client-generated idempotency key.

```sql
ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(64) UNIQUE;
```

Before inserting, check:

```sql
SELECT order_id FROM orders WHERE idempotency_key = @key;
-- If found → return existing order_id, skip insert
-- If not found → proceed with INSERT
```

The `UNIQUE` constraint on `idempotency_key` provides a DB-level guard against race conditions where two requests arrive simultaneously.

---

## PART 4 — SQL-BASED ORDER BOOK RECONSTRUCTION

---

### 4.1 Market Depth Reconstruction (Optimized)

Your current `market_depth` view queries `orders` directly — this is **incorrect for event-sourced design** because it uses the original `quantity`, not the remaining quantity derived from events.

**Correct event-sourced market depth:**

```sql
CREATE OR REPLACE VIEW live_order_book AS
WITH remaining_quantities AS (
    SELECT
        o.order_id,
        o.instrument_id,
        o.side,
        o.price,
        o.quantity AS original_qty,
        o.quantity - COALESCE(SUM(
            CASE WHEN oe.event_type IN ('ORDER_PARTIALLY_FILLED','ORDER_FILLED')
                 THEN oe.quantity ELSE 0 END
        ), 0) AS remaining_qty
    FROM orders o
    LEFT JOIN order_events oe ON o.order_id = oe.order_id
    WHERE o.status IN ('OPEN', 'PARTIALLY_FILLED')
    GROUP BY o.order_id, o.instrument_id, o.side, o.price, o.quantity
    HAVING remaining_qty > 0
)
SELECT
    instrument_id,
    side,
    price,
    SUM(remaining_qty)    AS total_volume,
    COUNT(*)              AS order_count,
    MIN(price)            AS level_price
FROM remaining_quantities
GROUP BY instrument_id, side, price
ORDER BY
    instrument_id,
    CASE WHEN side = 'BUY' THEN price END DESC,
    CASE WHEN side = 'SELL' THEN price END ASC;
```

**Why this is correct:** It derives remaining quantity from the event stream, not from a mutable column. The `orders` table stores the *original* quantity; the *remaining* quantity is computed by subtracting the sum of all fill events.

---

### 4.2 Best Bid/Ask and Spread

```sql
WITH book AS (
    SELECT
        o.instrument_id,
        o.side,
        o.price,
        o.quantity - COALESCE((
            SELECT SUM(oe.quantity)
            FROM order_events oe
            WHERE oe.order_id = o.order_id
            AND oe.event_type IN ('ORDER_PARTIALLY_FILLED','ORDER_FILLED')
        ), 0) AS remaining_qty
    FROM orders o
    WHERE o.status IN ('OPEN','PARTIALLY_FILLED')
),
best_prices AS (
    SELECT
        instrument_id,
        MAX(CASE WHEN side = 'BUY'  THEN price END) AS best_bid,
        SUM(CASE WHEN side = 'BUY'  AND price = (
            SELECT MAX(price) FROM book b2
            WHERE b2.instrument_id = book.instrument_id AND b2.side = 'BUY'
        ) THEN remaining_qty END)                     AS bid_depth,
        MIN(CASE WHEN side = 'SELL' THEN price END) AS best_ask,
        SUM(CASE WHEN side = 'SELL' AND price = (
            SELECT MIN(price) FROM book b2
            WHERE b2.instrument_id = book.instrument_id AND b2.side = 'SELL'
        ) THEN remaining_qty END)                     AS ask_depth
    FROM book
    WHERE remaining_qty > 0
    GROUP BY instrument_id
)
SELECT
    instrument_id,
    best_bid,
    bid_depth,
    best_ask,
    ask_depth,
    (best_ask - best_bid)                        AS absolute_spread,
    ROUND((best_ask - best_bid) / ((best_ask + best_bid) / 2) * 100, 4)
                                                  AS spread_pct,
    (best_ask + best_bid) / 2                    AS mid_price
FROM best_prices;
```

---

### 4.3 Time-Travel Query — Order Book at Timestamp T

This is the hallmark query of event sourcing. Reconstruct what the book looked like at any past point in time:

```sql
-- Input: @target_time = '2026-04-01 14:30:00'
-- Input: @target_instrument = 1

WITH events_until_t AS (
    SELECT
        oe.order_id,
        oe.event_type,
        oe.quantity,
        oe.price AS event_price,
        oe.event_timestamp
    FROM order_events oe
    WHERE oe.event_timestamp <= @target_time
),
order_state_at_t AS (
    SELECT
        o.order_id,
        o.instrument_id,
        o.side,
        o.price,
        o.quantity AS original_qty,
        -- Was order placed before T?
        MAX(CASE WHEN e.event_type = 'ORDER_PLACED' THEN 1 ELSE 0 END) AS was_placed,
        -- Was order cancelled before T?
        MAX(CASE WHEN e.event_type = 'ORDER_CANCELLED' THEN 1 ELSE 0 END) AS was_cancelled,
        -- Was order fully filled before T?
        MAX(CASE WHEN e.event_type = 'ORDER_FILLED' THEN 1 ELSE 0 END) AS was_filled,
        -- Total filled quantity before T
        COALESCE(SUM(CASE
            WHEN e.event_type IN ('ORDER_PARTIALLY_FILLED','ORDER_FILLED')
            THEN e.quantity ELSE 0
        END), 0) AS filled_qty
    FROM orders o
    JOIN events_until_t e ON o.order_id = e.order_id
    WHERE o.instrument_id = @target_instrument
    GROUP BY o.order_id, o.instrument_id, o.side, o.price, o.quantity
),
active_orders_at_t AS (
    SELECT
        order_id, instrument_id, side, price,
        original_qty - filled_qty AS remaining_qty
    FROM order_state_at_t
    WHERE was_placed = 1
      AND was_cancelled = 0
      AND was_filled = 0
      AND (original_qty - filled_qty) > 0
)
SELECT
    side,
    price,
    SUM(remaining_qty)    AS total_volume,
    COUNT(*)              AS order_count
FROM active_orders_at_t
GROUP BY side, price
ORDER BY
    CASE WHEN side = 'BUY' THEN price END DESC,
    CASE WHEN side = 'SELL' THEN price END ASC;
```

**Why this works:** By filtering `event_timestamp <= @target_time`, we replay only events that had occurred by time T. Orders placed after T do not appear. Orders cancelled or filled before T are excluded. The result is a faithful snapshot of the book as it existed at T.

---

### 4.4 Query Complexity Analysis

| Query | Time Complexity | I/O Pattern | Bottleneck |
|---|---|---|---|
| Market depth (live) | O(A × E) where A = active orders, E = avg events per order | Index scan on `orders.status`, hash join with `order_events` | Events table aggregation |
| Best bid/ask | O(A × E) + O(P) where P = price levels | Same as depth + single MAX/MIN | Subquery in CASE filter |
| Time-travel at T | O(E_T) where E_T = all events before T | Range scan on `event_timestamp` index | Full event history scan up to T |
| Spread evolution | O(T × A × E) if computed for T timesteps | Repeated time-travel queries | Catastrophic without materialized snapshots |

**Index usage:**

- `idx_orders_instrument_side_price` → covers the WHERE + ORDER BY for best bid/ask
- `idx_events_order_time` → covers the JOIN + aggregation in remaining_qty subquery
- Time-travel query critically needs `idx_events_timestamp` (see Part 5)

---

## PART 5 — INDEXING & PERFORMANCE STRATEGY

---

### Proposed Indexes

```sql
-- ═══════════════════════════════════════════════════════
-- INDEX 1: Primary order book lookup
-- Covers: market depth queries, best bid/ask
-- ═══════════════════════════════════════════════════════
CREATE INDEX idx_orders_book_lookup
ON orders(instrument_id, side, status, price, created_at);

-- WHY THIS ORDER:
-- 1. instrument_id: first filter (equality), highest selectivity
-- 2. side: equality filter (BUY or SELL)
-- 3. status: equality filter (IN ('OPEN','PARTIALLY_FILLED'))
-- 4. price: range scan (ORDER BY DESC/ASC)
-- 5. created_at: tiebreaker for FIFO at same price

-- ═══════════════════════════════════════════════════════
-- INDEX 2: Event sourcing – fill aggregation
-- Covers: remaining_qty subquery
-- ═══════════════════════════════════════════════════════
CREATE INDEX idx_events_order_type_qty
ON order_events(order_id, event_type, quantity);

-- WHY: covering index for the SUM(quantity) subquery
-- Eliminates table access — InnoDB can answer from index alone

-- ═══════════════════════════════════════════════════════
-- INDEX 3: Time-travel queries
-- Covers: event_timestamp range scans
-- ═══════════════════════════════════════════════════════
CREATE INDEX idx_events_timestamp_order
ON order_events(event_timestamp, order_id, event_type);

-- WHY THIS ORDER:
-- 1. event_timestamp: range filter (<= @target_time)
-- 2. order_id: JOIN key with orders table
-- 3. event_type: filter for fill events (covering)

-- ═══════════════════════════════════════════════════════
-- INDEX 4: Trade analytics — by instrument + time
-- ═══════════════════════════════════════════════════════
CREATE INDEX idx_trades_instrument_time
ON trades(buy_order_id, trade_timestamp);

CREATE INDEX idx_trades_sell_time
ON trades(sell_order_id, trade_timestamp);

-- WHY: VWAP, trade volume, and execution analytics
-- join through orders to get instrument_id

-- ═══════════════════════════════════════════════════════
-- INDEX 5: Order lifecycle analytics
-- ═══════════════════════════════════════════════════════
CREATE INDEX idx_events_order_timestamp
ON order_events(order_id, event_timestamp);

-- WHY: ORDER LIFETIME query:
-- MIN(event_timestamp) = placed, MAX(event_timestamp) = last event
-- Index-only scan possible

-- ═══════════════════════════════════════════════════════
-- INDEX 6: Idempotency lookup
-- ═══════════════════════════════════════════════════════
-- Already handled by: UNIQUE(idempotency_key) on orders

-- ═══════════════════════════════════════════════════════
-- INDEX 7: Trader portfolio queries
-- ═══════════════════════════════════════════════════════
CREATE INDEX idx_orders_trader_instrument
ON orders(trader_id, instrument_id, status);

-- ═══════════════════════════════════════════════════════
-- INDEX 8: Cancellation analytics
-- ═══════════════════════════════════════════════════════
CREATE INDEX idx_events_type_timestamp
ON order_events(event_type, event_timestamp);

-- WHY: cancel ratio, event rate queries
-- Equality on event_type + range on timestamp

-- ═══════════════════════════════════════════════════════
-- INDEX 9: Trade price lookups (VWAP, candlesticks)
-- ═══════════════════════════════════════════════════════
CREATE INDEX idx_trades_timestamp_price_qty
ON trades(trade_timestamp, price, quantity);
```

---

### Composite Index Ordering Rationale

The general principle: **equality columns first, then range/sort columns, then covering columns.**

```
idx_orders_book_lookup:
  instrument_id  → equality  (= 1)
  side           → equality  (= 'BUY')
  status         → equality  (IN (...))
  price          → range     (ORDER BY DESC)
  created_at     → sort      (tiebreaker)

  EXPLAIN output (expected):
  type: range
  key: idx_orders_book_lookup
  rows: ~N (active orders for this instrument+side)
  Extra: Using index condition; Using filesort (for created_at within price)
```

If `price` were placed before `status`, the IN condition on status would break the B-tree range scan on price. The current ordering allows InnoDB to traverse the index tree as: `instrument_id → side → status → price (sorted)`.

---

### Read vs Write Trade-offs

| Index | Read Benefit | Write Cost |
|---|---|---|
| `idx_orders_book_lookup` (5 cols) | Eliminates table scan for all book queries | Every INSERT/UPDATE to `orders` must update this index — ~2× write amplification |
| `idx_events_order_type_qty` (3 cols, covering) | Covers remaining_qty subquery entirely from index | Every event INSERT touches this index |
| `idx_events_timestamp_order` | Time-travel queries drop from O(N) table scan to O(log N) seek + range scan | Adds a B-tree entry per event |
| `idx_trades_timestamp_price_qty` | VWAP/candlestick queries become index-only | One additional B-tree update per trade |

**Assessment:** In a LOB system, reads heavily outnumber writes. Order book depth is queried on every UI refresh (100ms–1s intervals), while orders arrive at a far lower rate in this academic context. The write amplification from indexes is acceptable.

**For a production system with >10K orders/sec**, you would consider:
- Materialized views refreshed periodically instead of live computation
- Read replicas for analytics queries
- The indexes above remain appropriate for the primary write path

---

### Expected Query Plans

**Market Depth Query:**
```
+----+----------+-------+------+------------------------+------------------------+
| id | sel_type | table | type | key                    | Extra                  |
+----+----------+-------+------+------------------------+------------------------+
|  1 | PRIMARY  | o     | ref  | idx_orders_book_lookup | Using index condition  |
|  2 | SUBQUERY | oe    | ref  | idx_events_order_type  | Using index            |
+----+----------+-------+------+------------------------+------------------------+
```

**Time-Travel Query:**
```
+----+----------+-------+-------+---------------------------+---------------------------+
| id | sel_type | table | type  | key                       | Extra                     |
+----+----------+-------+-------+---------------------------+---------------------------+
|  1 | PRIMARY  | oe    | range | idx_events_timestamp_order| Using index condition     |
|  1 | PRIMARY  | o     | eq_ref| PRIMARY                   | Using where               |
+----+----------+-------+-------+---------------------------+---------------------------+
```

---

## PART 6 — FRONTEND INTEGRATION

---

### Current Architecture (Your LOBDashboard)

```
LOBDashboard.jsx
     │
     ├── RNG seeded mock data generators
     │     ├── genBook()    → mock order book
     │     ├── genTrades()  → mock trade tape
     │     ├── genCandles() → mock candlestick data
     │     └── genOrders()  → mock order lifecycle
     │
     └── setInterval (500ms) → synthetic price walk
           ├── setMid(p + random)
           ├── setTrades([new, ...old])
           └── setBook(mutate qty randomly)
```

**Problem:** All data is fake. The RNG generators and `setInterval` mock replace what should be DB-driven data.

---

### Target Architecture: DB-Driven Backend

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────────┐
│   React UI   │◄───▶│  Express/Fastify   │◄───▶│   MySQL (InnoDB) │
│  (Vite)      │ WS  │  REST + WebSocket  │ SQL │   lob_system DB  │
└──────────────┘     └────────────────────┘     └──────────────────┘
```

---

### API Endpoints

```
GET  /api/instruments                    → SELECT * FROM instruments
GET  /api/book/:instrumentId             → Execute live_order_book CTE
GET  /api/book/:instrumentId?at=<ISO>    → Time-travel query at T
GET  /api/trades/:instrumentId?limit=50  → Recent trades
GET  /api/orders/:traderId               → Trader's order lifecycle
POST /api/orders                         → place_order() procedure
DELETE /api/orders/:orderId              → cancel_order() procedure
GET  /api/analytics/vwap/:instrumentId   → VWAP query
GET  /api/analytics/spread/:instrumentId → Spread evolution
WS   /ws/live/:instrumentId              → Push: book + trades real-time
```

---

### Replacing Mock WebSocket with DB-Driven Streaming

**Option A: Polling-based (simplest, sufficient for academic demo)**

```javascript
// Backend (Express)
const express = require('express');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({ /* connection config */ });

app.get('/api/book/:instrumentId', async (req, res) => {
    const [rows] = await pool.execute(`
        WITH remaining_quantities AS (
            SELECT o.order_id, o.side, o.price,
                   o.quantity - COALESCE(SUM(
                       CASE WHEN oe.event_type IN ('ORDER_PARTIALLY_FILLED','ORDER_FILLED')
                            THEN oe.quantity ELSE 0 END
                   ), 0) AS remaining_qty
            FROM orders o
            LEFT JOIN order_events oe ON o.order_id = oe.order_id
            WHERE o.instrument_id = ?
              AND o.status IN ('OPEN','PARTIALLY_FILLED')
            GROUP BY o.order_id, o.side, o.price, o.quantity
            HAVING remaining_qty > 0
        )
        SELECT side, price,
               SUM(remaining_qty) AS total_volume,
               COUNT(*) AS order_count
        FROM remaining_quantities
        GROUP BY side, price
        ORDER BY CASE WHEN side = 'BUY' THEN 1 ELSE 2 END,
                 CASE WHEN side = 'BUY' THEN -price ELSE price END
    `, [req.params.instrumentId]);

    const bids = rows.filter(r => r.side === 'BUY');
    const asks = rows.filter(r => r.side === 'SELL');
    res.json({ bids, asks });
});
```

**Frontend replacement (App.jsx):**

```javascript
// Replace setInterval mock with DB polling
useEffect(() => {
    if (mode !== "live") return;
    const fetchBook = async () => {
        const res = await fetch(`/api/book/${instrumentId}`);
        const data = await res.json();
        setBook(data);
    };
    const interval = setInterval(fetchBook, 1000); // 1s poll
    return () => clearInterval(interval);
}, [mode, instrumentId]);
```

**Option B: Server-Sent Events (better for live updates)**

```javascript
// Backend
app.get('/api/stream/:instrumentId', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendUpdate = async () => {
        const [book] = await pool.execute(BOOK_QUERY, [req.params.instrumentId]);
        const [trades] = await pool.execute(RECENT_TRADES_QUERY, [req.params.instrumentId]);
        res.write(`event: book\ndata: ${JSON.stringify(book)}\n\n`);
        res.write(`event: trades\ndata: ${JSON.stringify(trades)}\n\n`);
    };

    const interval = setInterval(sendUpdate, 500);
    req.on('close', () => clearInterval(interval));
});
```

---

### Historical Replay (Time-Travel UI)

Your `ReplayBar` component currently increments a counter `replayIdx` with no data binding. Here's how to make it DB-driven:

```javascript
// When replay mode is active, fetch book state at event N
const handleStep = async (delta) => {
    const newIdx = Math.max(0, Math.min(totalEvents, replayIdx + delta));
    setReplayIdx(newIdx);

    // Fetch the timestamp of event N
    const eventRes = await fetch(`/api/events/${instrumentId}?offset=${newIdx}&limit=1`);
    const { event_timestamp } = await eventRes.json();

    // Time-travel query
    const bookRes = await fetch(`/api/book/${instrumentId}?at=${event_timestamp}`);
    const bookData = await bookRes.json();
    setBook(bookData);
};
```

The `?at=<timestamp>` parameter triggers the time-travel query from Part 4.3. Each step in the replay slider fetches the order book as it existed at that event's timestamp.

---

## PART 7 — CRITICAL IMPROVEMENTS

---

### 7.1 Schema Weaknesses

> [!CAUTION]
> These are issues a DBMS professor **will** question.

**1. Missing `remaining_quantity` (or derived correctly)**

Your `orders.quantity` stores the original quantity, but there is no `remaining_quantity` column. Currently, you must compute it via:

```sql
o.quantity - SUM(fill_events.quantity)
```

**Fix options:**
- **Option A (Purist event sourcing):** No `remaining_quantity` column. Always derive from events. Academically strongest — proves event sourcing works. Performance cost on every query.
- **Option B (CQRS — recommended):** Add `remaining_quantity` as a derived/denormalized column updated via trigger when fill events are inserted. Clearly document it as a "read model," not source of truth.

```sql
ALTER TABLE orders ADD COLUMN remaining_quantity INT NOT NULL DEFAULT 0;

-- Set on insert via trigger:
CREATE TRIGGER set_initial_remaining
BEFORE INSERT ON orders
FOR EACH ROW
SET NEW.remaining_quantity = NEW.quantity;

-- Update on fill event:
DELIMITER $$
CREATE TRIGGER update_remaining_on_fill
AFTER INSERT ON order_events
FOR EACH ROW
BEGIN
    IF NEW.event_type IN ('ORDER_PARTIALLY_FILLED', 'ORDER_FILLED') THEN
        UPDATE orders
        SET remaining_quantity = remaining_quantity - NEW.quantity
        WHERE order_id = NEW.order_id;
    END IF;
END$$
DELIMITER ;
```

**2. Missing `order_type` column**

The matching engine supports LIMIT and MARKET orders. Your schema has no `order_type`:

```sql
ALTER TABLE orders ADD COLUMN order_type ENUM('LIMIT','MARKET') NOT NULL DEFAULT 'LIMIT';
```

**3. `status` should be ENUM, not VARCHAR**

```sql
-- Current: VARCHAR(20) — allows any string
-- Fix:
ALTER TABLE orders MODIFY COLUMN status
    ENUM('OPEN','PARTIALLY_FILLED','FILLED','CANCELLED') NOT NULL DEFAULT 'OPEN';
```

VARCHAR for status is a normalization violation — it permits invalid states.

**4. No `instrument_id` on `trades`**

You must JOIN through `orders` to find which instrument a trade belongs to. For analytical queries, this is expensive:

```sql
ALTER TABLE trades ADD COLUMN instrument_id INT NOT NULL;
ALTER TABLE trades ADD FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id);
```

This is **intentional denormalization for query performance** — document it as such.

**5. Trades price constraint is missing context**

Trade price `150.5` in your sample data does not equal either order's limit price. In a real LOB, the execution price is the resting order's price. Your sample data has `(1,2,150.5,50)` where order 1 is at 150 and order 2 at 151 — the midpoint is not how matching works. The trade should execute at 151 (the price of buyer's limit if buyer is aggressor) or 150 (seller's price if seller is aggressor).

---

### 7.2 Event Model Gaps

**1. Missing event types**

| Missing Event | When | Why It Matters |
|---|---|---|
| `ORDER_AMENDED` | Price or quantity modified | SRS mentions "Order cancellation/modification APIs" as future work — model events now |
| `ORDER_EXPIRED` | TTL reached | Matching engine has `expiration` field; your events don't cover it |
| `ORDER_REJECTED` | Invalid order (failed CHECK) | Audit completeness |

```sql
ALTER TABLE order_events MODIFY COLUMN event_type ENUM(
    'ORDER_PLACED',
    'ORDER_PARTIALLY_FILLED',
    'ORDER_FILLED',
    'ORDER_CANCELLED',
    'ORDER_AMENDED',
    'ORDER_EXPIRED',
    'ORDER_REJECTED'
) NOT NULL;
```

**2. Events have no `remaining_quantity_after`**

Without storing the resulting state, event replay requires ordered aggregation:

```sql
ALTER TABLE order_events ADD COLUMN remaining_after INT;
```

This makes each event self-describing — you can reconstruct state from any single event without scanning all predecessors.

**3. Events have no `sequence_number`**

Timestamps have limited resolution (`TIMESTAMP` = 1 second in MySQL). Two events within the same second have ambiguous ordering:

```sql
ALTER TABLE order_events ADD COLUMN sequence_no BIGINT AUTO_INCREMENT UNIQUE;
```

Or use `event_timestamp DATETIME(6)` for microsecond precision.

---

### 7.3 Normalization Issues

| Issue | Severity | Fix |
|---|---|---|
| `orders.status` is derived from events but stored independently | Medium — risks inconsistency | Document as CQRS read model; add trigger to sync |
| `trades` lacks `instrument_id` — must JOIN through `orders` | Medium — O(N) JOIN for analytics | Add denormalized `instrument_id` FK |
| `market_depth` VIEW uses `orders.quantity` not remaining | **Critical** — view shows wrong book | Rewrite as CTE-based view (Part 4.1) |
| `order_details` VIEW lacks event state | Medium | Extend with subquery for status from events |
| No normalization of `event_type` string | Low | Using ENUM is acceptable; a lookup table would be 4NF |

---

### 7.4 Analytical Query Improvements

**1. VWAP should be per-instrument:**
```sql
-- Current (broken — global VWAP):
SELECT SUM(price * quantity) / SUM(quantity) AS vwap FROM trades;

-- Correct:
SELECT
    o.instrument_id,
    i.symbol,
    SUM(t.price * t.quantity) / SUM(t.quantity) AS vwap
FROM trades t
JOIN orders o ON t.buy_order_id = o.order_id
JOIN instruments i ON o.instrument_id = i.instrument_id
GROUP BY o.instrument_id, i.symbol;
```

**2. Cancel/Fill Ratio should use window functions:**
```sql
WITH event_counts AS (
    SELECT
        DATE(event_timestamp) AS event_date,
        SUM(CASE WHEN event_type = 'ORDER_CANCELLED' THEN 1 ELSE 0 END) AS cancels,
        SUM(CASE WHEN event_type = 'ORDER_FILLED' THEN 1 ELSE 0 END) AS fills
    FROM order_events
    GROUP BY DATE(event_timestamp)
)
SELECT
    event_date,
    cancels,
    fills,
    ROUND(cancels / NULLIF(fills, 0), 2) AS cancel_fill_ratio,
    SUM(cancels) OVER (ORDER BY event_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
        / NULLIF(SUM(fills) OVER (ORDER BY event_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 0)
        AS rolling_7d_ratio
FROM event_counts
ORDER BY event_date;
```

**3. Order Flow Imbalance with time buckets:**
```sql
WITH time_buckets AS (
    SELECT
        FROM_UNIXTIME(
            FLOOR(UNIX_TIMESTAMP(oe.event_timestamp) / 60) * 60
        ) AS bucket,
        o.side,
        SUM(oe.quantity) AS volume
    FROM order_events oe
    JOIN orders o ON oe.order_id = o.order_id
    WHERE oe.event_type = 'ORDER_PLACED'
    GROUP BY bucket, o.side
)
SELECT
    bucket,
    COALESCE(MAX(CASE WHEN side = 'BUY'  THEN volume END), 0) AS buy_volume,
    COALESCE(MAX(CASE WHEN side = 'SELL' THEN volume END), 0) AS sell_volume,
    (COALESCE(MAX(CASE WHEN side = 'BUY' THEN volume END), 0) -
     COALESCE(MAX(CASE WHEN side = 'SELL' THEN volume END), 0))
    /
    NULLIF(COALESCE(MAX(CASE WHEN side = 'BUY' THEN volume END), 0) +
           COALESCE(MAX(CASE WHEN side = 'SELL' THEN volume END), 0), 0)
    AS order_flow_imbalance
FROM time_buckets
GROUP BY bucket
ORDER BY bucket;
```

---

### 7.5 What a DBMS Professor Will Question

| Question | Expected Answer |
|---|---|
| "Why is `orders.status` stored if you claim event sourcing?" | It is a denormalized CQRS read model optimized for query performance. The canonical state is derived from `order_events`. We can verify consistency via: `SELECT * FROM orders WHERE status != (derived_from_events)` |
| "What is the time complexity of your time-travel query?" | O(E_T × log N) where E_T = events before T, N = index depth. With `idx_events_timestamp_order`, the range scan is O(E_T) and the JOIN is O(log N) per event via PRIMARY KEY lookup |
| "How do you handle concurrent order placement?" | `SELECT ... FOR UPDATE` acquires row-level exclusive locks in InnoDB. Combined with `REPEATABLE READ` isolation, this prevents lost updates and ensures serialized matching |
| "Can your system scale to millions of events?" | Yes, with: (1) covering indexes to avoid table scans, (2) partitioning `order_events` by `event_timestamp` range, (3) materialized snapshots every N minutes for time-travel instead of scanning from epoch |
| "Why not use a materialized view for market depth?" | MySQL does not natively support materialized views. Alternatives: (1) scheduled `CREATE TABLE AS SELECT` refreshes, (2) trigger-maintained summary table, (3) application-level cache |
| "Your `market_depth` view is wrong. Why?" | The current view uses `SUM(quantity)` from `orders` — this is original quantity, not remaining. The corrected version uses a CTE to subtract fill events. Without this, cancelled/filled orders incorrectly contribute volume |
| "Show me the anomaly your system prevents." | Without `REPEATABLE READ` + `FOR UPDATE`: TX1 reads best bid = Order #1 (qty 100). TX2 reads same best bid. Both match against it, producing 200 units traded from a 100-unit order. Our locking prevents TX2 from reading the row until TX1 commits |

---

### 7.6 Scalability Roadmap

| Scale Tier | Strategy |
|---|---|
| **<100K events** (academic demo) | Current schema + indexes. No partitioning needed |
| **100K–10M events** | Partition `order_events` by month: `PARTITION BY RANGE (UNIX_TIMESTAMP(event_timestamp))` |
| **10M–1B events** | Snapshot table: every 5 minutes, store full book state. Time-travel queries seek nearest snapshot, then replay only delta events |
| **>1B events** | Cold storage archival of events older than N months. TimescaleDB or ClickHouse for analytics. Hot path remains MySQL with recent events only |

```sql
-- Partitioned events table (MySQL 8.0+)
ALTER TABLE order_events
PARTITION BY RANGE (UNIX_TIMESTAMP(event_timestamp)) (
    PARTITION p_2026_q1 VALUES LESS THAN (UNIX_TIMESTAMP('2026-04-01')),
    PARTITION p_2026_q2 VALUES LESS THAN (UNIX_TIMESTAMP('2026-07-01')),
    PARTITION p_2026_q3 VALUES LESS THAN (UNIX_TIMESTAMP('2026-10-01')),
    PARTITION p_future   VALUES LESS THAN MAXVALUE
);
```

---

### Summary of All Proposed Schema Changes

```sql
-- 1. order_type support
ALTER TABLE orders ADD COLUMN order_type ENUM('LIMIT','MARKET') NOT NULL DEFAULT 'LIMIT';

-- 2. Status as ENUM
ALTER TABLE orders MODIFY COLUMN status
    ENUM('OPEN','PARTIALLY_FILLED','FILLED','CANCELLED') NOT NULL DEFAULT 'OPEN';

-- 3. Remaining quantity (CQRS read model)
ALTER TABLE orders ADD COLUMN remaining_quantity INT NOT NULL DEFAULT 0;

-- 4. Idempotency
ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(64) UNIQUE;

-- 5. Instrument on trades
ALTER TABLE trades ADD COLUMN instrument_id INT NOT NULL;
ALTER TABLE trades ADD FOREIGN KEY (instrument_id) REFERENCES instruments(instrument_id);

-- 6. Extended event types
ALTER TABLE order_events MODIFY COLUMN event_type ENUM(
    'ORDER_PLACED','ORDER_PARTIALLY_FILLED','ORDER_FILLED',
    'ORDER_CANCELLED','ORDER_AMENDED','ORDER_EXPIRED','ORDER_REJECTED'
) NOT NULL;

-- 7. Event remaining_after
ALTER TABLE order_events ADD COLUMN remaining_after INT;

-- 8. Microsecond timestamps
ALTER TABLE order_events MODIFY COLUMN event_timestamp DATETIME(6) DEFAULT NOW(6);
ALTER TABLE trades MODIFY COLUMN trade_timestamp DATETIME(6) DEFAULT NOW(6);
```
