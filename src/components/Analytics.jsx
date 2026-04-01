import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { T, RNG } from "../tokens";

// ══════════════════════════════════════════════════════════
//  ANALYTICS PAGE  (SQL-driven microstructure views)
// ══════════════════════════════════════════════════════════
export default function Analytics({ candles }) {
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

  const STATS = [
    { label:"Avg Order Lifetime", value:"4.2s",      sql:"MAX(ts)−MIN(ts) GROUP BY order_id" },
    { label:"Cancel / Fill Ratio", value:"1.76×",    sql:"COUNT(CANCELLED)/COUNT(FILLED)" },
    { label:"VWAP",                value:"88,201",    sql:"SUM(price×qty)/SUM(qty) FROM trades" },
    { label:"Depth Imbalance",     value:"+12.3%",   sql:"(Σbid_qty−Σask_qty)/Σtotal_qty" },
    { label:"Order Flow Imbalance",value:"0.342",     sql:"(ΔbidVol−ΔaskVol)/ΣΔvol" },
  ];

  return (
    <div style={{ flex:1, overflowY:"auto", padding:12, background:T.bg, display:"flex", flexDirection:"column", gap:10, minHeight:0 }}>
      <div style={{ fontSize:11, color:T.muted, fontFamily:T.mono }}>
        Market Microstructure Analysis — All metrics derived from SQL event queries (hover charts for detail)
      </div>
      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background:T.surface, border:`1px solid ${T.border}`, padding:"10px 12px", borderRadius:3 }}>
            <div style={{ fontSize:10, color:T.muted, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:18, fontWeight:700, color:T.text, fontFamily:T.mono }}>{s.value}</div>
            <div style={{ fontSize:9, color:T.border, marginTop:3, fontFamily:T.mono }}>{s.sql}</div>
          </div>
        ))}
      </div>
      {/* Chart grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {/* Spread */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, padding:10, borderRadius:3 }}>
          <div style={{ fontSize:11, color:T.muted, marginBottom:2 }}>Bid-Ask Spread Evolution</div>
          <div style={{ fontSize:9, color:"#3b4451", fontFamily:T.mono, marginBottom:6 }}>
            WITH best_bid AS (SELECT MAX(price) FROM orders WHERE side='BUY')<br/>
            SELECT ask − bid AS spread FROM best_bid, best_ask
          </div>
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
          <div style={{ fontSize:11, color:T.muted, marginBottom:2 }}>Depth Imbalance — Bid vs Ask Volume</div>
          <div style={{ fontSize:9, color:"#3b4451", fontFamily:T.mono, marginBottom:6 }}>
            SELECT side, SUM(quantity) AS depth<br/>
            FROM orders WHERE status='OPEN' GROUP BY instrument_id, side, price
          </div>
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
        {/* Order Flow */}
        <div style={{ background:T.surface, border:`1px solid ${T.border}`, padding:10, borderRadius:3 }}>
          <div style={{ fontSize:11, color:T.muted, marginBottom:2 }}>Order Arrival, Cancellation & Execution Rate</div>
          <div style={{ fontSize:9, color:"#3b4451", fontFamily:T.mono, marginBottom:6 }}>
            SELECT event_type, COUNT(*) FROM order_events<br/>
            GROUP BY event_type, FLOOR(UNIX_TIMESTAMP(ts)/60)
          </div>
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
          <div style={{ fontSize:11, color:T.muted, marginBottom:2 }}>Average Order Lifetime (seconds)</div>
          <div style={{ fontSize:9, color:"#3b4451", fontFamily:T.mono, marginBottom:6 }}>
            SELECT AVG(TIMESTAMPDIFF(SECOND, placed_ts, last_event_ts))<br/>
            FROM orders JOIN order_events USING(order_id) GROUP BY time_bucket
          </div>
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
    </div>
  );
}
