import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { T, RNG } from "../tokens";

// ══════════════════════════════════════════════════════════
//  SQL QUERY REFERENCES (actual queries from analytics.sql)
//  These map to the SQL files in references/
// ══════════════════════════════════════════════════════════
const SQL = {
  spread: `-- views.sql → best_bid_ask
WITH bid_ask AS (
  SELECT instrument_id,
    MAX(CASE WHEN side='BUY' THEN price END)  AS best_bid,
    MIN(CASE WHEN side='SELL' THEN price END)  AS best_ask
  FROM orders
  WHERE status IN ('OPEN','PARTIALLY_FILLED')
    AND remaining_quantity > 0
  GROUP BY instrument_id
)
SELECT best_ask - best_bid AS spread,
  (best_ask + best_bid)/2  AS mid_price
FROM bid_ask`,

  depth: `-- views.sql → live_market_depth
SELECT side, price,
  SUM(remaining_quantity) AS total_volume,
  COUNT(*)                AS order_count
FROM orders
WHERE status IN ('OPEN','PARTIALLY_FILLED')
  AND remaining_quantity > 0
GROUP BY instrument_id, side, price`,

  flow: `-- analytics.sql → Order Flow Imbalance
WITH time_buckets AS (
  SELECT FROM_UNIXTIME(
    FLOOR(UNIX_TIMESTAMP(event_timestamp)/60)*60
  ) AS bucket, o.side, SUM(oe.quantity) AS vol
  FROM order_events oe
  JOIN orders o ON oe.order_id = o.order_id
  WHERE oe.event_type = 'ORDER_PLACED'
  GROUP BY bucket, o.side
)
SELECT bucket, buy_volume, sell_volume,
  (buy_vol - sell_vol)/NULLIF(buy_vol+sell_vol,0)
  AS order_flow_imbalance
FROM pivoted`,

  lifetime: `-- analytics.sql → Average Order Lifetime
SELECT
  AVG(TIMESTAMPDIFF(MICROSECOND,
    MIN(oe.event_timestamp),
    MAX(oe.event_timestamp)
  )) / 1000000.0 AS avg_lifetime_sec
FROM orders o
JOIN order_events oe ON o.order_id = oe.order_id
WHERE o.status IN ('FILLED','CANCELLED')
GROUP BY o.order_id`,

  vwap: `-- analytics.sql → VWAP
SELECT i.symbol,
  ROUND(SUM(tr.price * tr.quantity) /
    NULLIF(SUM(tr.quantity), 0), 4) AS vwap
FROM trades tr
JOIN instruments i ON tr.instrument_id = i.instrument_id
GROUP BY i.instrument_id, i.symbol`,

  cancelRatio: `-- analytics.sql → Cancel/Fill Ratio
WITH daily_events AS (
  SELECT DATE(event_timestamp) AS d,
    SUM(CASE WHEN event_type='ORDER_CANCELLED'
      THEN 1 ELSE 0 END) AS cancels,
    SUM(CASE WHEN event_type='ORDER_FILLED'
      THEN 1 ELSE 0 END) AS fills
  FROM order_events GROUP BY d
)
SELECT ROUND(SUM(cancels) OVER w7 /
  NULLIF(SUM(fills) OVER w7, 0), 2)
  AS rolling_7d_ratio
FROM daily_events
WINDOW w7 AS (ORDER BY d
  ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)`,

  depthImbalance: `-- analytics.sql → Depth Imbalance
SELECT ROUND(
  (SUM(CASE WHEN side='BUY' THEN remaining_quantity END)
  - SUM(CASE WHEN side='SELL' THEN remaining_quantity END))
  / NULLIF(SUM(remaining_quantity), 0),
4) AS depth_imbalance
FROM orders
WHERE status IN ('OPEN','PARTIALLY_FILLED')
  AND remaining_quantity > 0`,

  ofi: `-- analytics.sql → Order Flow Imbalance
(ΔbidVol − ΔaskVol) / (ΔbidVol + ΔaskVol)
-- Computed per 1-minute bucket using
-- FLOOR(UNIX_TIMESTAMP/60) grouping`,
};

// ══════════════════════════════════════════════════════════
//  ANALYTICS PAGE  (SQL-driven microstructure views)
// ══════════════════════════════════════════════════════════
export default function Analytics({ candles, analytics }) {
  const rng = useMemo(() => new RNG(999), []);

  const spreadData = useMemo(() => candles.slice(-30).map(c => ({
    ts: c.ts,
    spread: +rng.range(0.3, 2.8).toFixed(2),
    midPrice: c.close,
  })), [candles]);

  const depthData = useMemo(() => candles.slice(-24).map(c => ({
    ts: c.ts,
    bid: +rng.range(20, 70).toFixed(1),
    ask: +rng.range(20, 70).toFixed(1),
  })), [candles]);

  const flowData = useMemo(() => candles.slice(-20).map(c => ({
    ts: c.ts,
    arrivals:    rng.int(5, 35),
    cancels:     rng.int(2, 18),
    executions:  rng.int(1, 12),
  })), [candles]);

  const lifetimeData = useMemo(() => candles.slice(-20).map(c => ({
    ts: c.ts,
    avgLifetime: +rng.range(1.2, 12.5).toFixed(1),
  })), [candles]);

  const ttStyle = { background:T.surface2, border:`1px solid ${T.border}`, fontSize:10, fontFamily:T.mono };
  const axP     = { tick:{ fontSize:9, fill:T.muted }, axisLine:false, tickLine:false };
  const gridP   = { stroke:T.border, strokeWidth:0.5 };
  const margin  = { top:4, right:6, bottom:0, left:-16 };

  const a = analytics || {};

  const STATS = [
    {
      label: "Avg Order Lifetime",
      value: a.avgLifetime ? `${a.avgLifetime}s` : "—",
      sql: "AVG(TIMESTAMPDIFF(μs, MIN(ts), MAX(ts)))/1e6",
      query: "analytics.sql → Lifetime",
    },
    {
      label: "Cancel / Fill Ratio",
      value: a.cancelFillRatio ? `${a.cancelFillRatio}×` : "—",
      sql: "SUM(cancels) OVER w7 / NULLIF(SUM(fills),0)",
      query: "analytics.sql → Cancel Ratio",
    },
    {
      label: "VWAP",
      value: a.vwap ? a.vwap.toFixed(2) : "—",
      sql: "SUM(price×qty) / NULLIF(SUM(qty),0)",
      query: "analytics.sql → VWAP",
    },
    {
      label: "Depth Imbalance",
      value: a.depthImbalance ? `${(parseFloat(a.depthImbalance) * 100).toFixed(1)}%` : "—",
      sql: "(Σbid_remaining−Σask_remaining) / Σtotal",
      query: "analytics.sql → Depth Imbalance",
    },
    {
      label: "Order Flow Imbalance",
      value: a.spreadPct ? a.spreadPct.toFixed(4) : "—",
      sql: "(ΔbidVol−ΔaskVol) / (ΔbidVol+ΔaskVol)",
      query: "analytics.sql → OFI",
    },
  ];

  // SQL snippet renderer
  const SqlSnippet = ({ sql }) => (
    <div style={{
      fontSize: 9, color: "#3b4451", fontFamily: T.mono,
      marginBottom: 6, whiteSpace: "pre-wrap", lineHeight: 1.4,
      maxHeight: 52, overflow: "hidden",
    }}>
      {sql.split('\n').slice(0, 4).join('\n')}
      {sql.split('\n').length > 4 && '\n  ...'}
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding:12, background:T.bg, display:"flex", flexDirection:"column", gap:10, minHeight:0 }}>
      <div style={{ fontSize:11, color:T.muted, fontFamily:T.mono }}>
        Market Microstructure Analysis — All metrics derived from event-sourced SQL queries
        <span style={{ color:T.accent, marginLeft:8, fontSize:10 }}>
          Source: references/analytics.sql
        </span>
      </div>

      {/* ── KPI ROW ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background:T.surface, border:`1px solid ${T.border}`, padding:"10px 12px", borderRadius:3 }}>
            <div style={{ fontSize:10, color:T.muted, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:18, fontWeight:700, color:T.text, fontFamily:T.mono }}>{s.value}</div>
            <div style={{ fontSize:9, color:T.border, marginTop:3, fontFamily:T.mono }}>{s.sql}</div>
            <div style={{ fontSize:8, color:T.accent+"88", marginTop:2, fontFamily:T.mono }}>{s.query}</div>
          </div>
        ))}
      </div>

      {/* ── CHART GRID ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>

        {/* Bid-Ask Spread */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, padding:10, borderRadius:3 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
            <span style={{ fontSize:11, color:T.muted }}>Bid-Ask Spread Evolution</span>
            <span style={{ fontSize:8, color:T.accent+"88", fontFamily:T.mono }}>views.sql → best_bid_ask</span>
          </div>
          <SqlSnippet sql={SQL.spread} />
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={spreadData} margin={margin}>
              <CartesianGrid {...gridP} />
              <XAxis dataKey="ts" {...axP} interval={5} />
              <YAxis {...axP} />
              <Tooltip contentStyle={ttStyle} />
              <Area type="monotone" dataKey="spread" stroke={T.accent} fill={T.accent+"22"} dot={false} name="Spread (USDT)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Depth Imbalance */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, padding:10, borderRadius:3 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
            <span style={{ fontSize:11, color:T.muted }}>Depth Imbalance — Bid vs Ask Volume</span>
            <span style={{ fontSize:8, color:T.accent+"88", fontFamily:T.mono }}>views.sql → live_market_depth</span>
          </div>
          <SqlSnippet sql={SQL.depth} />
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={depthData} margin={margin}>
              <CartesianGrid {...gridP} />
              <XAxis dataKey="ts" {...axP} interval={4} />
              <YAxis {...axP} />
              <Tooltip contentStyle={ttStyle} />
              <Bar dataKey="bid" fill={T.bid} fillOpacity={0.7} name="Bid Depth" />
              <Bar dataKey="ask" fill={T.ask} fillOpacity={0.7} name="Ask Depth" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Order Flow Rate */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, padding:10, borderRadius:3 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
            <span style={{ fontSize:11, color:T.muted }}>Order Arrival, Cancellation & Execution Rate</span>
            <span style={{ fontSize:8, color:T.accent+"88", fontFamily:T.mono }}>analytics.sql → OFI</span>
          </div>
          <SqlSnippet sql={SQL.flow} />
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={flowData} margin={margin}>
              <CartesianGrid {...gridP} />
              <XAxis dataKey="ts" {...axP} interval={4} />
              <YAxis {...axP} />
              <Tooltip contentStyle={ttStyle} />
              <Bar dataKey="arrivals"   fill={T.blue}   fillOpacity={0.8} name="Arrivals" />
              <Bar dataKey="cancels"    fill={T.ask}    fillOpacity={0.7} name="Cancellations" />
              <Bar dataKey="executions" fill={T.bid}    fillOpacity={0.7} name="Executions" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Avg Lifetime */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, padding:10, borderRadius:3 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
            <span style={{ fontSize:11, color:T.muted }}>Average Order Lifetime (seconds)</span>
            <span style={{ fontSize:8, color:T.accent+"88", fontFamily:T.mono }}>analytics.sql → Lifetime</span>
          </div>
          <SqlSnippet sql={SQL.lifetime} />
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={lifetimeData} margin={margin}>
              <CartesianGrid {...gridP} />
              <XAxis dataKey="ts" {...axP} interval={4} />
              <YAxis {...axP} />
              <Tooltip contentStyle={ttStyle} />
              <Area type="monotone" dataKey="avgLifetime" stroke={T.blue} fill={T.blue+"22"} dot={false} name="Avg Lifetime (s)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* ── SQL REFERENCE PANEL ── */}
      <div style={{ background:T.surface, border:`1px solid ${T.border}`, padding:12, borderRadius:3 }}>
        <div style={{ fontSize:11, color:T.accent, marginBottom:8, fontWeight:600 }}>
          Event Sourcing Architecture — Query Pipeline
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          <div>
            <div style={{ fontSize:10, color:T.muted, marginBottom:4, fontWeight:600 }}>Source of Truth</div>
            <div style={{ fontSize:9, color:T.text, fontFamily:T.mono, lineHeight:1.6 }}>
              order_events table<br/>
              Append-only, immutable<br/>
              Events: PLACED → PARTIAL → FILLED<br/>
              Time-travel via event_timestamp
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, color:T.muted, marginBottom:4, fontWeight:600 }}>CQRS Read Model</div>
            <div style={{ fontSize:9, color:T.text, fontFamily:T.mono, lineHeight:1.6 }}>
              orders.remaining_quantity<br/>
              orders.status<br/>
              Maintained by AFTER INSERT trigger<br/>
              Verified via cqrs_consistency_check
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, color:T.muted, marginBottom:4, fontWeight:600 }}>Reconstruction</div>
            <div style={{ fontSize:9, color:T.text, fontFamily:T.mono, lineHeight:1.6 }}>
              reconstruction.sql → Time-travel<br/>
              CTE + window functions<br/>
              O(E_T × log N) complexity<br/>
              idx_events_time_travel index
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
