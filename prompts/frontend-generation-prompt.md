Role: You are a senior frontend engineer and UI architect designing a professional trading dashboard for a Limit Order Book (LOB) & Matching Engine system used by quantitative trading firms and academic evaluators.

📌 Project Context

We are building a frontend web application for a Data-Driven Level Order Booking System that models, stores, reconstructs, and analyzes limit order book (LOB) data using event-based market data.

The backend:

Implements an in-memory matching engine

Uses price-time priority

Streams real-time data via WebSockets

Persists historical order & trade data in PostgreSQL

Supports market state reconstruction at any historical timestamp

This frontend is not for retail trading, but for:

Market microstructure analysis

Order book visualization

Academic / interview demonstration

SQL-driven historical reconstruction

The UI should feel professional, exchange-grade, and data-dense, similar to Binance/Coinbase Pro, but focused on analysis, not execution profit.

🎯 Frontend Objectives

The frontend must:

Visualize real-time order book dynamics

Display price-time priority at each price level

Show trade executions and order lifecycle

Allow historical reconstruction of the order book

Support quantitative analysis views

Clearly reflect event-driven market state changes

🧱 Tech Stack Constraints

Framework: React (preferred) or Next.js

Styling: Tailwind CSS or CSS Modules

Charts: TradingView Lightweight Charts / D3.js

State: WebSocket-driven real-time updates

No backend logic in frontend

Mock APIs allowed for demo mode

🖥️ Layout & Pages
1️⃣ Main Trading Dashboard (Core Page)

Design a single-screen dashboard layout similar to professional crypto exchanges.

Layout Sections:

A. Header Bar

Instrument selector (e.g., BTC/USDT)

Connection status (WebSocket: Connected / Disconnected)

Mode indicator:

LIVE MODE

HISTORICAL REPLAY MODE

Timestamp display (exchange time)

B. Order Book Panel (Left)

Two stacked tables:

Asks (Sell Orders) – red

Bids (Buy Orders) – green

Columns:

Price

Quantity

Total (cumulative depth)

Visual depth bars per price level

Hover shows:

Number of individual orders

FIFO queue size

Clearly indicate best bid / best ask

Animate updates on insert / delete / match

C. Price Chart (Center)

Candlestick chart

Timeframes:

1s, 5s, 1m, 5m, 1h

Overlay:

Trade executions

VWAP (optional)

Sync chart time with order book events

D. Market Trades Tape (Right)

Real-time trade feed

Columns:

Time

Price

Quantity

Aggressor side (BUY/SELL)

Color-coded trades

Auto-scroll with pause option

E. Order Lifecycle Panel (Bottom)
Tabs:

Active Orders

Completed Trades

Cancelled Orders

Each row shows:

Order ID

Side

Price

Original Quantity

Remaining Quantity

Status

Timestamp

⏪ Historical Reconstruction Mode (Key Feature)
2️⃣ Market Replay & Reconstruction View

Provide a time travel slider that allows the user to:

Select any historical timestamp

Reconstruct:

Full order book state

Active orders

Market depth

Step through events:

+1 event

+10 events

Play / Pause replay

UI Requirements:

Timeline slider with event density markers

Current replay timestamp shown clearly

Disable live updates during replay

Label mode clearly as REPLAY MODE

📊 Analytics & SQL-Driven Insights Page
3️⃣ Market Microstructure Analysis Page

Display analytical insights derived from SQL queries.

Sections:

Order arrival rate over time

Cancellation vs execution ratio

Average order lifetime

Depth imbalance (bid vs ask)

Spread evolution

Each chart must:

Have tooltips

Show query source (for academic clarity)

Be filterable by time range

🔌 Data Integration Requirements
WebSocket Events Handled

order_added

order_matched

order_partially_filled

order_cancelled

trade_executed

order_book_snapshot

Frontend must:

Apply incremental updates

Never re-fetch full state unless reconnecting

Maintain deterministic UI state

🎨 Design Language

Dark theme (exchange style)

High contrast, readable numbers

Minimal animations (only for state changes)

Dense but structured UI

Professional, institutional look

No cartoonish UI. No gamification.

🧪 Demo & Evaluation Support

Include:

Toggle: Live / Mock Data

Seed button to generate synthetic market activity

Deterministic replay for evaluation

Clear labels for evaluators

📁 Output Expectations

Generate:

Component hierarchy

Page layouts

Key React components

WebSocket handling logic (frontend only)

Styling approach

Clear comments explaining market concepts

Do NOT implement backend logic.

📌 Final Note

This frontend must demonstrate understanding of limit order books, market microstructure, and event-driven systems, not just UI skills.
