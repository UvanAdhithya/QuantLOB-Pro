// ═══════════════════════════════════════════════════════════
//  QuantLOB — Express API Server
//  Bridges MySQL (event-sourced LOB) → React Frontend
// ═══════════════════════════════════════════════════════════

import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ── MySQL Connection Pool ──
const pool = mysql.createPool({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "root123",
  database: "lob_system",
  waitForConnections: true,
  connectionLimit: 10,
});

// ═══════════════════════════════════════════════════════
//  GET /api/instruments
//  Returns all tradeable instruments
// ═══════════════════════════════════════════════════════
app.get("/api/instruments", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM instruments WHERE is_active = TRUE");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  GET /api/book/:instrumentId
//  Live order book depth (or time-travel with ?at=)
//  Uses: live_market_depth view / time-travel CTE
// ═══════════════════════════════════════════════════════
app.get("/api/book/:instrumentId", async (req, res) => {
  try {
    const instId = parseInt(req.params.instrumentId);
    const atTime = req.query.at; // optional time-travel param

    let bids, asks;

    if (atTime) {
      // ── TIME-TRAVEL QUERY ──
      const [rows] = await pool.execute(`
        WITH events_until_t AS (
          SELECT oe.order_id, oe.event_type, oe.quantity
          FROM order_events oe
          WHERE oe.event_timestamp <= ?
        ),
        order_state_at_t AS (
          SELECT
            o.order_id, o.side, o.price, o.quantity AS original_qty,
            MAX(CASE WHEN e.event_type = 'ORDER_PLACED' THEN 1 ELSE 0 END) AS was_placed,
            MAX(CASE WHEN e.event_type = 'ORDER_CANCELLED' THEN 1 ELSE 0 END) AS was_cancelled,
            MAX(CASE WHEN e.event_type = 'ORDER_FILLED' THEN 1 ELSE 0 END) AS was_filled,
            COALESCE(SUM(CASE WHEN e.event_type IN ('ORDER_PARTIALLY_FILLED','ORDER_FILLED')
              THEN e.quantity ELSE 0 END), 0) AS filled_qty
          FROM orders o
          JOIN events_until_t e ON o.order_id = e.order_id
          WHERE o.instrument_id = ?
          GROUP BY o.order_id, o.side, o.price, o.quantity
          HAVING was_placed = 1 AND was_cancelled = 0 AND was_filled = 0
             AND (o.quantity - filled_qty) > 0
        )
        SELECT side, price,
               SUM(original_qty - filled_qty) AS qty,
               COUNT(*) AS n
        FROM order_state_at_t
        GROUP BY side, price
        ORDER BY CASE WHEN side = 'BUY' THEN 1 ELSE 2 END,
                 CASE WHEN side = 'BUY' THEN -price ELSE price END
      `, [atTime, instId]);

      bids = rows.filter(r => r.side === "BUY").map(r => ({
        price: parseFloat(r.price), qty: parseInt(r.qty), n: parseInt(r.n),
      }));
      asks = rows.filter(r => r.side === "SELL").map(r => ({
        price: parseFloat(r.price), qty: parseInt(r.qty), n: parseInt(r.n),
      }));
    } else {
      // ── LIVE BOOK ──
      const [rows] = await pool.execute(`
        SELECT side, price, total_volume AS qty, order_count AS n
        FROM live_market_depth
        WHERE instrument_id = ?
      `, [instId]);

      bids = rows.filter(r => r.side === "BUY").map(r => ({
        price: parseFloat(r.price), qty: parseInt(r.qty), n: parseInt(r.n),
      }));
      asks = rows.filter(r => r.side === "SELL").map(r => ({
        price: parseFloat(r.price), qty: parseInt(r.qty), n: parseInt(r.n),
      }));
    }

    // Sort: bids descending, asks ascending
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    // Calculate mid price
    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;
    const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;

    res.json({ bids, asks, mid, spread: bestAsk - bestBid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  GET /api/trades/:instrumentId
//  Recent trades for an instrument
// ═══════════════════════════════════════════════════════
app.get("/api/trades/:instrumentId", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const [rows] = await pool.execute(`
      SELECT
        tr.trade_id AS id,
        tr.price,
        tr.quantity AS qty,
        CASE
          WHEN ob.created_at > os.created_at THEN ob.side
          ELSE os.side
        END AS side,
        DATE_FORMAT(tr.trade_timestamp, '%H:%i:%s') AS ts,
        tr.trade_timestamp
      FROM trades tr
      JOIN orders ob ON tr.buy_order_id = ob.order_id
      JOIN orders os ON tr.sell_order_id = os.order_id
      WHERE tr.instrument_id = ?
      ORDER BY tr.trade_timestamp DESC
      LIMIT ?
    `, [req.params.instrumentId, limit]);

    res.json(rows.map(r => ({
      id: r.id,
      price: parseFloat(r.price),
      qty: parseInt(r.qty),
      side: r.side,
      ts: r.ts,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  GET /api/orders/:instrumentId
//  Order lifecycle for an instrument
// ═══════════════════════════════════════════════════════
app.get("/api/orders/:instrumentId", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        o.order_id,
        CONCAT('ORD-', o.order_id) AS id,
        o.side,
        o.price,
        o.quantity AS orig,
        o.quantity - o.remaining_quantity AS filled,
        o.status,
        DATE_FORMAT(o.created_at, '%H:%i:%s') AS ts
      FROM orders o
      WHERE o.instrument_id = ?
      ORDER BY o.created_at DESC
    `, [req.params.instrumentId]);

    res.json(rows.map(r => ({
      id: r.id,
      side: r.side,
      price: parseFloat(r.price),
      orig: parseInt(r.orig),
      filled: parseInt(r.filled),
      status: r.status,
      ts: r.ts,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  GET /api/events/:instrumentId
//  All order events for replay timeline
// ═══════════════════════════════════════════════════════
app.get("/api/events/:instrumentId", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT oe.event_id, oe.order_id, oe.event_type,
             oe.quantity, oe.price, oe.remaining_after,
             DATE_FORMAT(oe.event_timestamp, '%Y-%m-%d %H:%i:%s.%f') AS event_timestamp,
             DATE_FORMAT(oe.event_timestamp, '%H:%i:%s') AS display_time
      FROM order_events oe
      JOIN orders o ON oe.order_id = o.order_id
      WHERE o.instrument_id = ?
      ORDER BY oe.event_id ASC
    `, [req.params.instrumentId]);

    res.json(rows.map(r => ({
      ...r,
      price: r.price ? parseFloat(r.price) : null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  GET /api/analytics/:instrumentId
//  Market microstructure KPIs
// ═══════════════════════════════════════════════════════
app.get("/api/analytics/:instrumentId", async (req, res) => {
  try {
    const instId = req.params.instrumentId;

    // VWAP
    const [[vwapRow]] = await pool.execute(`
      SELECT ROUND(SUM(price * quantity) / NULLIF(SUM(quantity), 0), 4) AS vwap,
             SUM(quantity) AS total_volume,
             COUNT(*) AS trade_count
      FROM trades WHERE instrument_id = ?
    `, [instId]);

    // Best Bid/Ask
    const [[spreadRow]] = await pool.execute(`
      SELECT best_bid, best_ask, absolute_spread AS spread,
             spread_pct, mid_price
      FROM best_bid_ask WHERE instrument_id = ?
    `, [instId]);

    // Event counts
    const [[eventRow]] = await pool.execute(`
      SELECT
        SUM(CASE WHEN oe.event_type = 'ORDER_PLACED' THEN 1 ELSE 0 END) AS placements,
        SUM(CASE WHEN oe.event_type = 'ORDER_FILLED' THEN 1 ELSE 0 END) AS fills,
        SUM(CASE WHEN oe.event_type = 'ORDER_CANCELLED' THEN 1 ELSE 0 END) AS cancels,
        SUM(CASE WHEN oe.event_type = 'ORDER_PARTIALLY_FILLED' THEN 1 ELSE 0 END) AS partial_fills
      FROM order_events oe
      JOIN orders o ON oe.order_id = o.order_id
      WHERE o.instrument_id = ?
    `, [instId]);

    // Avg order lifetime
    const [[lifetimeRow]] = await pool.execute(`
      SELECT ROUND(AVG(lifetime), 3) AS avg_lifetime FROM (
        SELECT TIMESTAMPDIFF(MICROSECOND, MIN(oe.event_timestamp), MAX(oe.event_timestamp)) / 1000000.0 AS lifetime
        FROM orders o
        JOIN order_events oe ON o.order_id = oe.order_id
        WHERE o.instrument_id = ? AND o.status IN ('FILLED','CANCELLED')
        GROUP BY o.order_id
      ) sub
    `, [instId]);

    // Depth imbalance
    const [[imbalanceRow]] = await pool.execute(`
      SELECT
        COALESCE(SUM(CASE WHEN side = 'BUY' THEN remaining_quantity ELSE 0 END), 0) AS bid_depth,
        COALESCE(SUM(CASE WHEN side = 'SELL' THEN remaining_quantity ELSE 0 END), 0) AS ask_depth
      FROM orders
      WHERE instrument_id = ? AND status IN ('OPEN','PARTIALLY_FILLED') AND remaining_quantity > 0
    `, [instId]);

    const bidDepth = parseInt(imbalanceRow?.bid_depth || 0);
    const askDepth = parseInt(imbalanceRow?.ask_depth || 0);
    const total = bidDepth + askDepth;

    res.json({
      vwap: vwapRow?.vwap ? parseFloat(vwapRow.vwap) : 0,
      totalVolume: parseInt(vwapRow?.total_volume || 0),
      tradeCount: parseInt(vwapRow?.trade_count || 0),
      bestBid: spreadRow?.best_bid ? parseFloat(spreadRow.best_bid) : null,
      bestAsk: spreadRow?.best_ask ? parseFloat(spreadRow.best_ask) : null,
      spread: spreadRow?.spread ? parseFloat(spreadRow.spread) : null,
      spreadPct: spreadRow?.spread_pct ? parseFloat(spreadRow.spread_pct) : null,
      midPrice: spreadRow?.mid_price ? parseFloat(spreadRow.mid_price) : null,
      placements: parseInt(eventRow?.placements || 0),
      fills: parseInt(eventRow?.fills || 0),
      cancels: parseInt(eventRow?.cancels || 0),
      partialFills: parseInt(eventRow?.partial_fills || 0),
      cancelFillRatio: eventRow?.fills > 0
        ? (parseInt(eventRow.cancels) / parseInt(eventRow.fills)).toFixed(2)
        : "N/A",
      avgLifetime: lifetimeRow?.avg_lifetime ? parseFloat(lifetimeRow.avg_lifetime) : 0,
      depthImbalance: total > 0
        ? ((bidDepth - askDepth) / total).toFixed(4)
        : "0",
      bidDepth,
      askDepth,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  POST /api/orders
//  Place a new order via stored procedure
// ═══════════════════════════════════════════════════════
app.post("/api/orders", async (req, res) => {
  try {
    const { traderId, instrumentId, side, orderType, price, quantity, idempotencyKey } = req.body;
    const [rows] = await pool.execute(
      "CALL place_order(?, ?, ?, ?, ?, ?, ?)",
      [traderId, instrumentId, side, orderType || "LIMIT", price, quantity, idempotencyKey || null]
    );
    res.json(rows[0][0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  DELETE /api/orders/:orderId
//  Cancel an order via stored procedure
// ═══════════════════════════════════════════════════════
app.delete("/api/orders/:orderId", async (req, res) => {
  try {
    const [rows] = await pool.execute("CALL cancel_order(?)", [req.params.orderId]);
    res.json(rows[0][0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  POST /api/match/:instrumentId
//  Run matching engine via stored procedure
// ═══════════════════════════════════════════════════════
app.post("/api/match/:instrumentId", async (req, res) => {
  try {
    await pool.execute("CALL execute_matching(?)", [req.params.instrumentId]);
    res.json({ status: "matching_complete" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
//  GET /api/health
//  Health check + DB connectivity
// ═══════════════════════════════════════════════════════
app.get("/api/health", async (req, res) => {
  try {
    const [[row]] = await pool.execute("SELECT 1 AS ok, NOW() AS server_time");
    res.json({ status: "ok", db: "connected", serverTime: row.server_time });
  } catch (err) {
    res.json({ status: "error", db: "disconnected", error: err.message });
  }
});

// ── Start Server ──
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n  QuantLOB API Server`);
  console.log(`  ───────────────────`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → MySQL: root@localhost:3306/lob_system`);
  console.log(`  → Endpoints:`);
  console.log(`     GET  /api/instruments`);
  console.log(`     GET  /api/book/:id`);
  console.log(`     GET  /api/book/:id?at=<ISO>`);
  console.log(`     GET  /api/trades/:id`);
  console.log(`     GET  /api/orders/:id`);
  console.log(`     GET  /api/events/:id`);
  console.log(`     GET  /api/analytics/:id`);
  console.log(`     POST /api/orders`);
  console.log(`     POST /api/match/:id`);
  console.log(`     GET  /api/health\n`);
});
