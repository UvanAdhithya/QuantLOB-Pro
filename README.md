# QuantLOB — Event-Sourced Limit Order Book

A full-stack, database-centric **Limit Order Book** system where MySQL is the single source of truth. Every order, fill, cancellation, and trade is recorded as an immutable event — enabling real-time order book visualization, market analytics, and **time-travel** to reconstruct the order book at any historical point.

<br>

## What Is This?

A **Limit Order Book (LOB)** is the core data structure powering every stock exchange. It maintains two sorted lists:

- **Bids** — buy orders, sorted by price (highest first)
- **Asks** — sell orders, sorted by price (lowest first)

When a buyer's price ≥ a seller's price, they **match** and a trade executes.

```
        ASKS (Sellers)
        ₹153.00  ×  55
        ₹152.00  ×  90
        ₹151.00  ×  20     ← Best Ask
      ─────────────────
        Spread = ₹1.00
      ─────────────────
        ₹150.00  × 100     ← Best Bid
        ₹149.50  ×  80
        ₹148.50  × 120
        BIDS (Buyers)
```

This project implements the entire pipeline — from order placement to matching to analytics — with the **database as the brain**, not in-memory code.

<br>

## Architecture

```
  React Dashboard (:5173)     Express API (:3001)        MySQL (:3306)
 ┌─────────────────────┐    ┌──────────────────┐    ┌──────────────────────┐
 │ Order Book (live)    │───▶│ GET /api/book/:id │───▶│ live_market_depth    │
 │ Trades Tape          │───▶│ GET /api/trades   │───▶│ trades JOIN orders   │
 │ Analytics (VWAP..)   │───▶│ GET /api/analytics│───▶│ VWAP, OFI, spreads   │
 │ Order Lifecycle      │───▶│ GET /api/orders   │───▶│ orders table         │
 │ Replay (time-travel) │───▶│ GET /api/book?at= │───▶│ CTE reconstruction   │
 │ Place Order          │───▶│ POST /api/orders  │───▶│ CALL place_order()   │
 │ Run Matching         │───▶│ POST /api/match   │───▶│ CALL execute_match() │
 └─────────────────────┘    └──────────────────┘    └──────────────────────┘
        Polls every 2s           mysql2 pool             InnoDB + Triggers
```

<br>

## The Core Idea: Event Sourcing

Most systems do this:

```sql
UPDATE orders SET status = 'FILLED' WHERE order_id = 5;  -- history lost!
```

We do this instead:

```sql
INSERT INTO order_events (order_id, event_type, quantity, remaining_after)
VALUES (5, 'ORDER_FILLED', 30, 0);
-- Trigger automatically updates orders.status = 'FILLED'
```

Every state change is an **immutable event** in the `order_events` table. The `orders.status` column is just a cached read model maintained by triggers. This gives us:

- **Complete audit trail** — every state transition is recorded
- **Time-travel** — reconstruct the order book at any past timestamp
- **Provable consistency** — a verification view proves the cache matches the event log

<br>

## DBMS Concepts Demonstrated

| Concept | Implementation |
|---|---|
| **Normalization (3NF)** | `instruments`, `traders`, `orders`, `trades` — no redundant data |
| **ACID Transactions** | `SELECT ... FOR UPDATE` row-level locking in matching engine |
| **3 Triggers** | Auto-generate events on order insert, sync derived state on event insert |
| **Stored Procedures** | `place_order()`, `cancel_order()`, `execute_matching()` |
| **Functions** | `get_vwap()`, `get_spread()`, `order_notional_value()` |
| **7 Views** | Market depth, bid/ask spread, order lifecycle, CQRS consistency check |
| **10 Indexes** | Composite covering indexes with documented tradeoffs |
| **JOINs** | INNER, LEFT, self-joins across 5 tables |
| **Window Functions** | `LAG()`, `SUM() OVER (ROWS BETWEEN ...)`, `ROW_NUMBER()` |
| **CTEs** | Multi-step time-travel reconstruction via Common Table Expressions |
| **Subqueries** | Correlated + non-correlated in analytics |
| **SET Operations** | UNION, INTERSECT, EXCEPT |
| **Constraints** | CHECK, FOREIGN KEY, UNIQUE, NOT NULL, ENUM |
| **DDL** | ALTER TABLE for adding columns, modifying types, adding constraints |
| **Cursor** | `process_large_orders()` demonstrates explicit cursor loop |
| **Denormalization** | Intentional `trades.instrument_id` for query performance (documented) |

<br>

## Database Schema

```
instruments ──┐
              ├──▶ orders ──▶ order_events (SOURCE OF TRUTH)
traders ──────┘       │
                      └──▶ trades
```

### Key Tables

**`order_events`** — Append-only event log. Never updated or deleted. Every row is a state transition:
```
ORDER_PLACED → ORDER_PARTIALLY_FILLED → ORDER_FILLED
                                      → ORDER_CANCELLED
```

**`orders`** — Contains two **derived columns** maintained by triggers:
- `remaining_quantity` — auto-decremented on fill events
- `status` — auto-updated based on event type

These exist purely for fast queries. The real state lives in events.

<br>

## The Trigger Cascade

When you insert an order, three triggers fire in sequence:

```
INSERT INTO orders (price=150, qty=100)
   │
   ├─▶ trg_orders_before_insert
   │     Sets remaining_quantity = 100
   │     Validates price > 0, quantity > 0
   │
   └─▶ trg_orders_after_insert
         Inserts ORDER_PLACED event into order_events
            │
            └─▶ trg_events_after_insert
                  (no-op for PLACED events, but fires
                   on FILLED/CANCELLED to update orders.status)
```

<br>

## Time-Travel Queries

The standout feature. Reconstruct the order book at any historical timestamp:

```sql
-- "What did the AAPL order book look like at this exact microsecond?"
GET /api/book/1?at=2026-04-02%2001:00:11.540000
```

Under the hood, this runs a CTE chain that:
1. Filters all events up to timestamp T
2. Computes each order's state (placed? cancelled? how much filled?)
3. Keeps only orders that were open at time T
4. Aggregates by price level into the book format

The **REPLAY** mode in the UI steps through events one by one, firing this query at each step.

<br>

## Project Structure

```
QuantLOBClaude/
├── references/                  # SQL files (run in order)
│   ├── schema_v2.sql            # Tables + triggers
│   ├── procedures.sql           # Stored procedures + functions
│   ├── views.sql                # 7 views
│   ├── indexes.sql              # 10 composite indexes
│   ├── analytics.sql            # Market microstructure queries
│   ├── reconstruction.sql       # Time-travel queries
│   └── seed_data.sql            # Sample data
│
├── server/
│   └── index.js                 # Express API → MySQL bridge
│
├── src/
│   ├── App.jsx                  # Dashboard (DB-driven)
│   ├── tokens.js                # Design tokens + fallback generators
│   └── components/
│       ├── OrderBook.jsx        # Bid/ask depth visualization
│       ├── CandlestickChart.jsx # OHLCV price chart (SVG)
│       ├── TradesTape.jsx       # Real-time trade feed
│       ├── OrderLifecycle.jsx   # Order status tracking
│       ├── ReplayBar.jsx        # Time-travel playback controls
│       └── Analytics.jsx        # VWAP, spread, depth metrics
│
├── vite.config.js               # Proxy /api → :3001
└── package.json
```

<br>

## Getting Started

### Prerequisites

- **Node.js** 18+
- **MySQL** 8.0+ (we used 9.6)

### 1. Install Dependencies

```bash
git clone https://github.com/UvanAdhithya/QuantLOB-Pro.git
cd QuantLOB-Pro
npm install
```

### 2. Setup MySQL

Start your MySQL server, then connect and run the SQL files in order:

```sql
mysql -u root -p

SOURCE references/schema_v2.sql;
SOURCE references/procedures.sql;
SOURCE references/views.sql;
SOURCE references/indexes.sql;
SOURCE references/seed_data.sql;
```

> Update the password in `server/index.js` (line 19) if yours differs from `root123`.

### 3. Run

```bash
# Terminal 1: API server
npm run server

# Terminal 2: Frontend
npm run dev
```

Open **http://localhost:5173** — the dashboard will show live data from MySQL.

### 4. Verify

In the MySQL shell:
```sql
-- Check the live order book
SELECT * FROM live_market_depth WHERE instrument_id = 1;

-- Verify event-sourced consistency
SELECT * FROM cqrs_consistency_check;  -- Empty = correct!

-- Compute VWAP
SELECT get_vwap(1) AS aapl_vwap;
```

<br>

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/instruments` | List all tradeable instruments |
| `GET` | `/api/book/:id` | Live order book depth |
| `GET` | `/api/book/:id?at=<timestamp>` | Historical order book (time-travel) |
| `GET` | `/api/trades/:id` | Recent trades |
| `GET` | `/api/orders/:id` | Order lifecycle |
| `GET` | `/api/events/:id` | Event log for replay |
| `GET` | `/api/analytics/:id` | VWAP, spread, depth imbalance, counts |
| `POST` | `/api/orders` | Place new order (calls `place_order()`) |
| `DELETE` | `/api/orders/:id` | Cancel order (calls `cancel_order()`) |
| `POST` | `/api/match/:id` | Execute matching engine |
| `GET` | `/api/health` | DB connectivity check |

<br>

## Tech Stack

| Layer | Technology |
|---|---|
| **Database** | MySQL 9.6 (InnoDB) |
| **API** | Node.js + Express + mysql2 |
| **Frontend** | React 19 + Vite 8 |
| **Charts** | Recharts + Custom SVG Candlesticks |
| **Styling** | Tailwind CSS 4 + Vanilla CSS |

<br>

## License

MIT
