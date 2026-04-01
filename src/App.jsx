import { useState, useEffect, useCallback } from "react";
import { T, RNG, INSTRUMENTS, BASE, genBook, genTrades, genCandles, genOrders } from "./tokens";
import OrderBook from "./components/OrderBook";
import CandlestickChart from "./components/CandlestickChart";
import TradesTape from "./components/TradesTape";
import OrderLifecycle from "./components/OrderLifecycle";
import ReplayBar from "./components/ReplayBar";
import Analytics from "./components/Analytics";

// ══════════════════════════════════════════════════════════
//  ROOT DASHBOARD  (LOBDashboard)
// ══════════════════════════════════════════════════════════
export default function App() {
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

            {/* Candlestick + Volume */}
            <div style={{ flex:1, background:T.bg, minHeight:0, overflow:"hidden" }}>
              <CandlestickChart candles={candles} />
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
