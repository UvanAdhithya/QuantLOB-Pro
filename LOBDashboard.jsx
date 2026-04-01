import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ══════════════════════════════════════════════════════════
//  DESIGN TOKENS
// ══════════════════════════════════════════════════════════
const T = {
  bg:       "#0b0e11",
  surface:  "#161a1e",
  surface2: "#1e2329",
  border:   "#2b3139",
  ask:      "#f6465d",
  bid:      "#0ecb81",
  text:     "#eaecef",
  muted:    "#848e9c",
  accent:   "#f0b90b",
  blue:     "#1890ff",
  mono:     "'JetBrains Mono', 'Fira Mono', monospace",
};

// ══════════════════════════════════════════════════════════
//  SEEDED RNG  (deterministic mock data for evaluation)
// ══════════════════════════════════════════════════════════
class RNG {
  constructor(seed = 42) { this.s = seed >>> 0; }
  next()        { this.s ^= this.s << 13; this.s ^= this.s >> 17; this.s ^= this.s << 5; return (this.s >>> 0) / 0xffffffff; }
  range(lo, hi) { return lo + this.next() * (hi - lo); }
  int(lo, hi)   { return Math.floor(this.range(lo, hi + 1)); }
  pick(arr)     { return arr[this.int(0, arr.length - 1)]; }
}

// ══════════════════════════════════════════════════════════
//  MOCK DATA GENERATORS
// ══════════════════════════════════════════════════════════
const INSTRUMENTS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];
const BASE        = { "BTC/USDT": 88200, "ETH/USDT": 3450, "SOL/USDT": 185, "BNB/USDT": 590 };

function genBook(mid, rng, levels = 16) {
  const asks = [], bids = [];
  for (let i = 0; i < levels; i++) {
    const step = mid * 0.0001;
    asks.push({ price: +(mid + (i + 1) * step).toFixed(2), qty: +rng.range(0.01, 3).toFixed(4), n: rng.int(1, 6) });
    bids.push({ price: +(mid - (i + 1) * step).toFixed(2), qty: +rng.range(0.01, 3).toFixed(4), n: rng.int(1, 6) });
  }
  asks.sort((a, b) => a.price - b.price);
  bids.sort((a, b) => b.price - a.price);
  return { asks, bids };
}

function genTrades(mid, rng, n = 40) {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    price:  +(mid + rng.range(-0.5, 0.5) * mid * 0.001).toFixed(2),
    qty:    +rng.range(0.0001, 0.5).toFixed(4),
    side:   rng.next() > 0.5 ? "BUY" : "SELL",
    ts:     new Date(Date.now() - i * 1800).toLocaleTimeString([], { hour12: false }),
  }));
}

function genCandles(mid, rng, n = 80) {
  let p = mid * 0.97;
  return Array.from({ length: n }, (_, i) => {
    const o = p;
    const c = +(o + rng.range(-0.004, 0.004) * p).toFixed(2);
    const h = +(Math.max(o, c) + rng.range(0, 0.0008) * p).toFixed(2);
    const l = +(Math.min(o, c) - rng.range(0, 0.0008) * p).toFixed(2);
    const vol = +rng.range(5, 80).toFixed(2);
    p = c;
    return { i, open: o, high: h, low: l, close: c, volume: vol,
      ts: new Date(Date.now() - (n - i) * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
  });
}

function genOrders(mid, rng, n = 24) {
  const STATUSES = ["OPEN","OPEN","OPEN","PARTIALLY_FILLED","FILLED","CANCELLED"];
  return Array.from({ length: n }, (_, i) => {
    const side   = rng.next() > 0.5 ? "BUY" : "SELL";
    const status = rng.pick(STATUSES);
    const orig   = +rng.range(0.01, 1.5).toFixed(4);
    const ratio  = status === "FILLED" ? 1 : status === "PARTIALLY_FILLED" ? rng.range(0.1, 0.9) : 0;
    return { id: `ORD-${2000 + i}`, side, price: +(mid + rng.range(-0.005, 0.005) * mid).toFixed(2),
      orig, filled: +(orig * ratio).toFixed(4), status,
      ts: new Date(Date.now() - i * 12000).toLocaleTimeString([], { hour12: false }) };
  });
}

// ══════════════════════════════════════════════════════════
//  DEPTH BAR  (visual fill behind each order book row)
// ══════════════════════════════════════════════════════════
function DepthBar({ qty, max, side }) {
  const pct = Math.min(100, (qty / max) * 100);
  return (
    <div style={{
      position: "absolute", top: 0, bottom: 0, width: `${pct}%`,
      [side === "ask" ? "right" : "left"]: 0,
      background: side === "ask" ? T.ask + "25" : T.bid + "25",
      pointerEvents: "none",
    }} />
  );
}

// ══════════════════════════════════════════════════════════
//  ORDER BOOK PANEL
// ══════════════════════════════════════════════════════════
function OrderBook({ book, mid }) {
  const [hovered, setHovered] = useState(null);
  const maxQty  = Math.max(...book.asks.map(r => r.qty), ...book.bids.map(r => r.qty));
  const spread  = (book.asks[0]?.price - book.bids[0]?.price) || 0;
  const pct     = ((spread / mid) * 100).toFixed(3);

  const Row = ({ row, side, idx }) => {
    let cum = 0;
    (side === "ask" ? book.asks : book.bids).slice(0, idx + 1).forEach(r => (cum += r.qty));
    const key = `${side}-${idx}`;
    return (
      <div
        style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", position:"relative",
          padding:"1px 8px", minHeight:19, alignItems:"center", cursor:"default", userSelect:"none" }}
        onMouseEnter={() => setHovered(key)}
        onMouseLeave={() => setHovered(null)}
      >
        <DepthBar qty={row.qty} max={maxQty} side={side} />
        {hovered === key && (
          <div style={{ position:"absolute", left:222, top:"50%", transform:"translateY(-50%)",
            background:T.surface2, border:`1px solid ${T.border}`, padding:"5px 10px",
            fontSize:10, fontFamily:T.mono, whiteSpace:"nowrap", zIndex:20, color:T.text,
            boxShadow:`0 4px 12px #00000080` }}>
            <div style={{ color:T.muted, marginBottom:3 }}>Price level detail</div>
            <div>Orders in queue: <span style={{ color:T.accent }}>{row.n}</span></div>
            <div>Cumulative depth: <span style={{ color:side==="ask"?T.ask:T.bid }}>{cum.toFixed(4)}</span></div>
            <div>FIFO priority: ascending timestamp</div>
          </div>
        )}
        <span style={{ fontSize:11, fontFamily:T.mono, color:side==="ask"?T.ask:T.bid, position:"relative" }}>{row.price.toFixed(2)}</span>
        <span style={{ fontSize:11, fontFamily:T.mono, color:T.text, textAlign:"right", position:"relative" }}>{row.qty.toFixed(4)}</span>
        <span style={{ fontSize:10, fontFamily:T.mono, color:T.muted, textAlign:"right", position:"relative" }}>{cum.toFixed(3)}</span>
      </div>
    );
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", width:222, background:T.surface, borderRight:`1px solid ${T.border}`, flexShrink:0, overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"9px 8px 6px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:6 }}>Order Book</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", fontSize:10, color:T.muted }}>
          <span>Price(USDT)</span>
          <span style={{ textAlign:"right" }}>Qty(BTC)</span>
          <span style={{ textAlign:"right" }}>Total</span>
        </div>
      </div>
      {/* Asks — lowest ask nearest spread */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"flex-end", overflow:"hidden", minHeight:0 }}>
        {[...book.asks].reverse().map((row, i) => (
          <Row key={i} row={row} side="ask" idx={book.asks.length - 1 - i} />
        ))}
      </div>
      {/* Spread row */}
      <div style={{ padding:"4px 8px", background:T.bg, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <span style={{ fontFamily:T.mono, fontSize:13, fontWeight:700, color:T.bid }}>
          {mid.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}
        </span>
        <span style={{ fontSize:10, color:T.muted }}>Spread {spread.toFixed(2)} ({pct}%)</span>
      </div>
      {/* Bids */}
      <div style={{ flex:1, overflow:"hidden", minHeight:0 }}>
        {book.bids.map((row, i) => <Row key={i} row={row} side="bid" idx={i} />)}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  CANDLESTICK CHART  (custom SVG — no library dependency)
// ══════════════════════════════════════════════════════════
function CandlestickChart({ candles }) {
  const ref  = useRef(null);
  const [sz, setSz] = useState({ w:600, h:300 });
  const [cx, setCx]  = useState(null);   // crosshair index

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSz({ w:e.contentRect.width, h:e.contentRect.height }));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const PAD = { t:8, r:8, b:24, l:64 };
  const cw  = sz.w - PAD.l - PAD.r;
  const ch  = sz.h - PAD.t - PAD.b;
  const vis = candles.slice(-Math.max(20, Math.floor(cw / 9)));
  const n   = vis.length;
  if (n === 0) return <div ref={ref} style={{ width:"100%", height:"100%" }} />;

  const prices = vis.flatMap(c => [c.high, c.low]);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const pad = (hi - lo) * 0.06;
  const plo = lo - pad, phi = hi + pad;

  const xOf = i  => PAD.l + (i + 0.5) * (cw / n);
  const yOf = p  => PAD.t + ch - ((p - plo) / (phi - plo)) * ch;
  const bw  = Math.max(2, (cw / n) * 0.62);

  const yGrid = Array.from({ length: 5 }, (_, i) => {
    const p = plo + ((phi - plo) * i) / 4;
    return { y: yOf(p), label: p.toFixed(0) };
  });
  const xStep = Math.max(1, Math.floor(n / 6));
  const xLabels = vis.filter((_, i) => i % xStep === 0);

  const handleMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx  = Math.floor(((e.clientX - rect.left - PAD.l) / cw) * n);
    setCx(idx >= 0 && idx < n ? idx : null);
  };

  const ch_data = cx !== null ? vis[cx] : null;

  return (
    <div ref={ref} style={{ width:"100%", height:"100%", position:"relative" }}>
      <svg width={sz.w} height={sz.h} style={{ display:"block" }}
        onMouseMove={handleMove} onMouseLeave={() => setCx(null)}>
        {/* Grid */}
        {yGrid.map((g, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={sz.w-PAD.r} y1={g.y} y2={g.y} stroke={T.border} strokeWidth={0.5} strokeDasharray="2 5" />
            <text x={PAD.l-5} y={g.y+4} textAnchor="end" fill={T.muted} fontSize={9} fontFamily="JetBrains Mono,monospace">{g.label}</text>
          </g>
        ))}
        {xLabels.map((c, i) => (
          <text key={i} x={xOf(vis.indexOf(c))} y={sz.h-6} textAnchor="middle" fill={T.muted} fontSize={9} fontFamily="JetBrains Mono,monospace">{c.ts}</text>
        ))}
        {/* Candles */}
        {vis.map((c, i) => {
          const color = c.close >= c.open ? T.bid : T.ask;
          const x     = xOf(i);
          const oy    = yOf(c.open),  cy = yOf(c.close);
          const hy    = yOf(c.high), ly  = yOf(c.low);
          const bodyY = Math.min(oy, cy);
          const bodyH = Math.max(1, Math.abs(cy - oy));
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={hy} y2={ly} stroke={color} strokeWidth={1} />
              <rect x={x-bw/2} y={bodyY} width={bw} height={bodyH} fill={color} opacity={0.9} />
            </g>
          );
        })}
        {/* Crosshair */}
        {cx !== null && ch_data && (
          <g>
            <line x1={xOf(cx)} x2={xOf(cx)} y1={PAD.t} y2={sz.h-PAD.b} stroke={T.muted} strokeWidth={0.5} strokeDasharray="3 3" />
            <rect x={xOf(cx)-68} y={PAD.t+2} width={136} height={50} rx={2} fill={T.surface2} stroke={T.border} strokeWidth={0.5} opacity={0.95} />
            <text x={xOf(cx)} y={PAD.t+14} textAnchor="middle" fontSize={9} fill={T.muted} fontFamily="JetBrains Mono,monospace">{ch_data.ts}</text>
            {[
              ["O", ch_data.open.toFixed(2),  T.text],
              ["H", ch_data.high.toFixed(2),  T.bid],
              ["L", ch_data.low.toFixed(2),   T.ask],
              ["C", ch_data.close.toFixed(2), ch_data.close >= ch_data.open ? T.bid : T.ask],
            ].map(([k, v, col], i) => (
              <text key={k} x={xOf(cx) - 48 + i * 34} y={PAD.t + 30} fontSize={9} fontFamily="JetBrains Mono,monospace" fill={col}>
                {k}:{v}
              </text>
            ))}
            <text x={xOf(cx)} y={PAD.t+44} textAnchor="middle" fontSize={9} fill={T.muted} fontFamily="JetBrains Mono,monospace">
              Vol:{ch_data.volume.toFixed(2)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  VOLUME BARS
// ══════════════════════════════════════════════════════════
function VolumeBars({ candles }) {
  const ref = useRef(null);
  const [sz, setSz] = useState({ w:600, h:60 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSz({ w:e.contentRect.width, h:e.contentRect.height }));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const PAD = { t:4, r:8, b:14, l:64 };
  const cw  = sz.w - PAD.l - PAD.r;
  const ch  = sz.h - PAD.t - PAD.b;
  const vis = candles.slice(-Math.max(20, Math.floor(cw / 9)));
  const n   = vis.length;
  const mxV = Math.max(...vis.map(c => c.volume));
  const bw  = Math.max(2, (cw / n) * 0.62);

  return (
    <div ref={ref} style={{ width:"100%", height:"100%" }}>
      <svg width={sz.w} height={sz.h} style={{ display:"block" }}>
        <text x={PAD.l-5} y={PAD.t+10} textAnchor="end" fill={T.muted} fontSize={9} fontFamily="JetBrains Mono,monospace">Vol</text>
        {vis.map((c, i) => {
          const bh = (c.volume / mxV) * ch;
          const x  = PAD.l + (i + 0.5) * (cw / n);
          return <rect key={i} x={x-bw/2} y={PAD.t+ch-bh} width={bw} height={bh} fill={c.close >= c.open ? T.bid : T.ask} opacity={0.45} />;
        })}
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  MARKET TRADES TAPE
// ══════════════════════════════════════════════════════════
function TradesTape({ trades }) {
  const [paused, setPaused] = useState(false);
  const listRef = useRef(null);
  useEffect(() => {
    if (!paused && listRef.current) listRef.current.scrollTop = 0;
  }, [trades, paused]);

  return (
    <div style={{ display:"flex", flexDirection:"column", width:210, background:T.surface, borderLeft:`1px solid ${T.border}`, flexShrink:0 }}>
      <div style={{ padding:"9px 8px 5px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <span style={{ fontSize:12, fontWeight:600, color:T.text }}>Market Trades</span>
        <button onClick={() => setPaused(p => !p)}
          style={{ fontSize:10, color:paused?T.accent:T.muted, background:"none", border:"none", cursor:"pointer", fontFamily:T.mono }}>
          {paused ? "▶ RESUME" : "⏸ PAUSE"}
        </button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 0.85fr", padding:"2px 8px", fontSize:10, color:T.muted, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <span>Price</span><span style={{ textAlign:"right" }}>Amount</span><span style={{ textAlign:"right" }}>Time</span>
      </div>
      <div ref={listRef} style={{ flex:1, overflowY:"auto", minHeight:0 }}>
        {trades.map((t, i) => (
          <div key={t.id} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 0.85fr", padding:"2px 8px",
            background: i === 0 ? (t.side==="BUY" ? T.bid+"18" : T.ask+"18") : "transparent",
            transition:"background 0.4s" }}>
            <span style={{ fontSize:11, fontFamily:T.mono, color:t.side==="BUY"?T.bid:T.ask }}>{t.price.toFixed(2)}</span>
            <span style={{ fontSize:11, fontFamily:T.mono, color:T.text, textAlign:"right" }}>{t.qty.toFixed(4)}</span>
            <span style={{ fontSize:10, fontFamily:T.mono, color:T.muted, textAlign:"right" }}>{t.ts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  ORDER LIFECYCLE PANEL  (Active / Completed / Cancelled)
// ══════════════════════════════════════════════════════════
function OrderLifecycle({ orders }) {
  const [tab, setTab] = useState("active");
  const filtered = orders.filter(o =>
    tab === "active"    ? ["OPEN","PARTIALLY_FILLED"].includes(o.status) :
    tab === "completed" ? o.status === "FILLED" :
    o.status === "CANCELLED"
  );
  const TABS   = [["active","Active Orders"],["completed","Completed"],["cancelled","Cancelled"]];
  const COLS   = ["Order ID","Side","Price","Qty","Filled","Status","Time"];
  const WIDTHS = "0.95fr 0.65fr 1fr 0.8fr 0.8fr 1.2fr 0.8fr";

  return (
    <div style={{ display:"flex", flexDirection:"column", background:T.surface, borderTop:`1px solid ${T.border}`, height:162, flexShrink:0 }}>
      <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        {TABS.map(([k,label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding:"5px 14px", fontSize:11, background:"none", border:"none", cursor:"pointer",
              color: tab===k ? T.accent : T.muted,
              borderBottom: tab===k ? `2px solid ${T.accent}` : "2px solid transparent" }}>
            {label}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <span style={{ fontSize:10, color:T.muted, alignSelf:"center", paddingRight:10, fontFamily:T.mono }}>
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:WIDTHS, padding:"3px 8px", fontSize:10, color:T.muted, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        {COLS.map(c => <span key={c}>{c}</span>)}
      </div>
      <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
        {filtered.map(o => (
          <div key={o.id} style={{ display:"grid", gridTemplateColumns:WIDTHS, padding:"2px 8px", fontSize:11, fontFamily:T.mono, alignItems:"center" }}>
            <span style={{ color:T.muted }}>{o.id}</span>
            <span style={{ color:o.side==="BUY"?T.bid:T.ask }}>{o.side}</span>
            <span style={{ color:T.text }}>{o.price.toFixed(2)}</span>
            <span style={{ color:T.text }}>{o.orig.toFixed(4)}</span>
            <span style={{ color:T.text }}>{o.filled.toFixed(4)}</span>
            <span style={{ fontSize:10, color: o.status==="FILLED"?T.bid : o.status==="CANCELLED"?T.ask : T.accent }}>{o.status}</span>
            <span style={{ fontSize:10, color:T.muted }}>{o.ts}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding:"18px 8px", textAlign:"center", fontSize:11, color:T.muted }}>No records</div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  REPLAY BAR  (historical reconstruction controls)
// ══════════════════════════════════════════════════════════
function ReplayBar({ idx, total, onStep, onClose }) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => {
    clearInterval(timerRef.current);
    if (playing) timerRef.current = setInterval(() => onStep(1), 700);
    return () => clearInterval(timerRef.current);
  }, [playing, onStep]);

  const pct = total ? (idx / total) * 100 : 0;
  const Btn = ({ label, onClick, col }) => (
    <button onClick={onClick}
      style={{ padding:"2px 10px", fontSize:11, background:T.surface2, border:`1px solid ${T.border}`,
        color:col||T.text, cursor:"pointer", fontFamily:T.mono, borderRadius:2 }}>
      {label}
    </button>
  );

  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"5px 14px", background:"#1a1205", borderBottom:`1px solid ${T.accent}44`, flexShrink:0 }}>
      <span style={{ fontSize:11, fontWeight:700, color:T.accent, letterSpacing:1, minWidth:94, fontFamily:T.mono }}>▶ REPLAY MODE</span>
      <div style={{ flex:1, height:4, background:T.border, borderRadius:2, position:"relative", cursor:"pointer" }}
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onStep(Math.round(((e.clientX-r.left)/r.width)*total) - idx); }}>
        <div style={{ position:"absolute", top:0, left:0, height:"100%", width:`${pct}%`, background:T.accent, borderRadius:2 }} />
      </div>
      <span style={{ fontSize:10, fontFamily:T.mono, color:T.muted, minWidth:90 }}>Event {idx} / {total}</span>
      <Btn label="−10" onClick={() => onStep(-10)} />
      <Btn label="−1"  onClick={() => onStep(-1)} />
      <Btn label={playing ? "⏸ PAUSE" : "▶ PLAY"} onClick={() => setPlaying(p => !p)} col={playing ? T.ask : T.bid} />
      <Btn label="+1"  onClick={() => onStep(1)} />
      <Btn label="+10" onClick={() => onStep(10)} />
      <Btn label="✕ EXIT REPLAY" onClick={onClose} col={T.ask} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
//  ANALYTICS PAGE  (SQL-driven microstructure views)
// ══════════════════════════════════════════════════════════
function Analytics({ candles }) {
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

// ══════════════════════════════════════════════════════════
//  ROOT DASHBOARD
// ══════════════════════════════════════════════════════════
export default function LOBDashboard() {
  const [instrument, setInstrument] = useState("BTC/USDT");
  const [page,       setPage]       = useState("trading");    // trading | analytics
  const [mode,       setMode]       = useState("live");       // live | replay
  const [replayIdx,  setReplayIdx]  = useState(0);
  const TOTAL = 120;

  const mid0 = BASE[instrument];
  const [mid,   setMid]   = useState(mid0);
  const [delta] = useState(-1.22);   // mock 24h change
  const [book,   setBook]   = useState(() => genBook(mid0,    new RNG(1)));
  const [trades, setTrades] = useState(() => genTrades(mid0,  new RNG(2)));
  const [candles]           = useState(() => genCandles(mid0, new RNG(3)));
  const [orders]            = useState(() => genOrders(mid0,  new RNG(4)));
  const [clock, setClock]   = useState(() => new Date().toLocaleTimeString([], { hour12:false }));

  // ── WebSocket simulation (live mode only) ──
  useEffect(() => {
    if (mode !== "live") return;
    const t = setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour12:false }));
      setMid(p => {
        const np = +(p + (Math.random() - 0.498) * p * 0.0003).toFixed(2);
        // Emit synthetic trade_executed event
        setTrades(ts => [{
          id:   Date.now(),
          price: np,
          qty:  +((Math.random() * 0.3 + 0.001)).toFixed(4),
          side: Math.random() > 0.5 ? "BUY" : "SELL",
          ts:   new Date().toLocaleTimeString([], { hour12:false }),
        }, ...ts.slice(0, 49)]);
        // Emit order_book_snapshot delta
        setBook(b => ({
          asks: b.asks.map(r => ({ ...r, qty: Math.max(0.001, +(r.qty + (Math.random()-0.5)*0.09).toFixed(4)) })),
          bids: b.bids.map(r => ({ ...r, qty: Math.max(0.001, +(r.qty + (Math.random()-0.5)*0.09).toFixed(4)) })),
        }));
        return np;
      });
    }, 500);
    return () => clearInterval(t);
  }, [mode]);

  const handleStep = useCallback((d) =>
    setReplayIdx(i => Math.max(0, Math.min(TOTAL, i + d))), []);

  // ── Shared button helper ──
  const NavBtn = ({ label, active, onClick }) => (
    <button onClick={onClick}
      style={{ padding:"4px 14px", fontSize:11, background:active?T.accent+"22":"none",
        border:active?`1px solid ${T.accent}55`:`1px solid ${T.border}`,
        color:active?T.accent:T.muted, cursor:"pointer", borderRadius:2 }}>
      {label}
    </button>
  );

  const Divider = () => <div style={{ width:1, height:20, background:T.border }} />;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:T.bg, color:T.text, fontFamily:"system-ui,sans-serif", overflow:"hidden" }}>
      {/* Google Font + global resets */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:${T.bg}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
        select option{background:${T.surface2}}
      `}</style>

      {/* ══ HEADER BAR ═══════════════════════════════════════ */}
      <div style={{ height:48, background:T.surface, borderBottom:`1px solid ${T.border}`,
        display:"flex", alignItems:"center", padding:"0 14px", gap:12, flexShrink:0 }}>

        <span style={{ fontWeight:700, fontSize:13, color:T.accent, fontFamily:T.mono, letterSpacing:0.5 }}>LOB·SYS</span>
        <Divider />

        {/* Instrument + live price */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <select value={instrument} onChange={e => setInstrument(e.target.value)}
            style={{ background:"transparent", border:`1px solid ${T.border}`, color:T.text,
              fontSize:12, fontWeight:700, padding:"3px 6px", cursor:"pointer", outline:"none", fontFamily:T.mono }}>
            {INSTRUMENTS.map(i => <option key={i} style={{ background:T.surface2 }}>{i}</option>)}
          </select>
          <span style={{ fontSize:18, fontWeight:700, color:T.bid, fontFamily:T.mono }}>
            {mid.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 })}
          </span>
          <span style={{ fontSize:12, color: delta < 0 ? T.ask : T.bid }}>{delta.toFixed(2)}%</span>
        </div>

        {/* 24h stats */}
        <div style={{ display:"flex", gap:18, fontSize:11, color:T.muted }}>
          {[["24h High","90,602.01"],["24h Low","87,704.00"],["24h Vol(BTC)","16,283.52"],["Vol(USDT)","1.45B"]].map(([k,v]) => (
            <div key={k} style={{ display:"flex", flexDirection:"column", gap:1 }}>
              <span style={{ fontSize:10 }}>{k}</span>
              <span style={{ color:T.text, fontFamily:T.mono }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ flex:1 }} />

        {/* Navigation */}
        <div style={{ display:"flex", gap:6 }}>
          <NavBtn label="Dashboard" active={page==="trading"}   onClick={() => setPage("trading")} />
          <NavBtn label="Analytics" active={page==="analytics"} onClick={() => setPage("analytics")} />
        </div>
        <Divider />
        <div style={{ display:"flex", gap:6 }}>
          <NavBtn label="LIVE"   active={mode==="live"}   onClick={() => setMode("live")} />
          <NavBtn label="REPLAY" active={mode==="replay"} onClick={() => setMode("replay")} />
        </div>
        <Divider />

        {/* WS status indicator */}
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <div style={{ width:6, height:6, borderRadius:"50%",
            background: mode==="live" ? T.bid : T.accent,
            boxShadow: `0 0 5px ${mode==="live" ? T.bid : T.accent}` }} />
          <span style={{ fontSize:10, color:T.muted, fontFamily:T.mono }}>
            WS:{mode==="live" ? "CONNECTED" : "REPLAY"}
          </span>
        </div>

        <span style={{ fontSize:11, fontFamily:T.mono, color:T.muted, minWidth:64 }}>{clock}</span>
      </div>

      {/* ══ REPLAY CONTROL BAR ═══════════════════════════════ */}
      {mode === "replay" && (
        <ReplayBar idx={replayIdx} total={TOTAL} onStep={handleStep} onClose={() => setMode("live")} />
      )}

      {/* ══ BODY ═════════════════════════════════════════════ */}
      {page === "trading" ? (
        <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

          {/* Order Book */}
          <OrderBook book={book} mid={mid} />

          {/* Center column */}
          <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>
            {/* Timeframe bar */}
            <div style={{ display:"flex", alignItems:"center", gap:1, padding:"5px 10px",
              borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.bg }}>
              {["1s","5s","1m","5m","1h","4h","1D"].map(tf => (
                <button key={tf}
                  style={{ padding:"2px 10px", fontSize:11, background:tf==="1m"?T.accent+"22":"none",
                    border:tf==="1m"?`1px solid ${T.accent}55`:"1px solid transparent",
                    color:tf==="1m"?T.accent:T.muted, cursor:"pointer", borderRadius:2 }}>{tf}</button>
              ))}
              <div style={{ flex:1 }} />
              <span style={{ fontSize:10, color:"#3b4451", fontFamily:T.mono }}>
                MA(7) · MA(25) · MA(99) · VWAP
              </span>
            </div>

            {/* Candlestick */}
            <div style={{ flex:1, background:T.bg, minHeight:0, overflow:"hidden" }}>
              <CandlestickChart candles={candles} />
            </div>

            {/* Volume */}
            <div style={{ height:68, background:T.bg, borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
              <VolumeBars candles={candles} />
            </div>

            {/* Order lifecycle */}
            <OrderLifecycle orders={orders} />
          </div>

          {/* Trades tape */}
          <TradesTape trades={trades} />
        </div>
      ) : (
        <Analytics candles={candles} />
      )}
    </div>
  );
}
