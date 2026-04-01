import { useState, useEffect, useCallback } from "react";
import { T, RNG, genCandles } from "./tokens";
import OrderBook from "./components/OrderBook";
import CandlestickChart from "./components/CandlestickChart";
import TradesTape from "./components/TradesTape";
import OrderLifecycle from "./components/OrderLifecycle";
import ReplayBar from "./components/ReplayBar";
import Analytics from "./components/Analytics";

// ══════════════════════════════════════════════════════════
//  INSTRUMENTS from DB (mapped to IDs)
// ══════════════════════════════════════════════════════════
const DB_INSTRUMENTS = [
  { id: 1, symbol: "AAPL",  name: "Apple Inc" },
  { id: 2, symbol: "GOOG",  name: "Alphabet Inc" },
  { id: 4, symbol: "TSLA",  name: "Tesla Inc" },
];

// ══════════════════════════════════════════════════════════
//  ROOT DASHBOARD  (DB-driven LOB System)
// ══════════════════════════════════════════════════════════
export default function App() {
  const [instrument, setInstrument] = useState(DB_INSTRUMENTS[0]);
  const [page,       setPage]       = useState("trading");    // trading | analytics
  const [mode,       setMode]       = useState("live");       // live | replay
  const [replayIdx,  setReplayIdx]  = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);

  const [mid,    setMid]    = useState(150);
  const [spread, setSpread] = useState(0);
  const [book,   setBook]   = useState({ asks: [], bids: [] });
  const [trades, setTrades] = useState([]);
  const [orders, setOrders] = useState([]);
  const [events, setEvents] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [clock,  setClock]  = useState(() => new Date().toLocaleTimeString([], { hour12:false }));

  // Candles still use mock (trades table doesn't have enough history for OHLCV yet)
  const [candles] = useState(() => genCandles(150, new RNG(3)));

  // ── Fetch DB data ──
  const fetchAll = useCallback(async () => {
    try {
      // Order book
      const bookRes = await fetch(`/api/book/${instrument.id}`);
      if (bookRes.ok) {
        const bookData = await bookRes.json();
        setBook({ asks: bookData.asks, bids: bookData.bids });
        setMid(bookData.mid || 0);
        setSpread(bookData.spread || 0);
        setDbConnected(true);
      }

      // Trades
      const tradeRes = await fetch(`/api/trades/${instrument.id}?limit=50`);
      if (tradeRes.ok) {
        const tradeData = await tradeRes.json();
        setTrades(tradeData);
      }

      // Orders
      const orderRes = await fetch(`/api/orders/${instrument.id}`);
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        setOrders(orderData);
      }

      // Analytics
      const analyticsRes = await fetch(`/api/analytics/${instrument.id}`);
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      }
    } catch {
      setDbConnected(false);
    }
  }, [instrument.id]);

  // ── Fetch events for replay ──
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${instrument.id}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
        setTotalEvents(data.length);
      }
    } catch { /* ignore */ }
  }, [instrument.id]);

  // ── Initial load + polling ──
  useEffect(() => {
    fetchAll();
    fetchEvents();
    const interval = setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour12:false }));
      if (mode === "live") fetchAll();
    }, 2000); // Poll DB every 2 seconds in live mode
    return () => clearInterval(interval);
  }, [fetchAll, fetchEvents, mode]);

  // ── Replay: time-travel via event timestamp ──
  const handleStep = useCallback(async (delta) => {
    const newIdx = Math.max(0, Math.min(totalEvents - 1, replayIdx + delta));
    setReplayIdx(newIdx);

    if (events[newIdx]) {
      // Server returns event_timestamp pre-formatted as "YYYY-MM-DD HH:MM:SS.ffffff"
      const timestamp = events[newIdx].event_timestamp;
      try {
        const res = await fetch(`/api/book/${instrument.id}?at=${encodeURIComponent(timestamp)}`);
        if (res.ok) {
          const data = await res.json();
          setBook({ asks: data.asks, bids: data.bids });
          setMid(data.mid || 0);
          setSpread(data.spread || 0);
        }
      } catch { /* ignore */ }
    }
  }, [replayIdx, totalEvents, events, instrument.id]);

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

        {/* Instrument selector (DB-driven) */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <select
            value={instrument.id}
            onChange={e => {
              const inst = DB_INSTRUMENTS.find(i => i.id === parseInt(e.target.value));
              if (inst) setInstrument(inst);
            }}
            style={{ background:"transparent", border:`1px solid ${T.border}`, color:T.text,
              fontSize:12, fontWeight:700, padding:"3px 6px", cursor:"pointer", outline:"none", fontFamily:T.mono }}>
            {DB_INSTRUMENTS.map(i => (
              <option key={i.id} value={i.id} style={{ background:T.surface2 }}>{i.symbol}</option>
            ))}
          </select>
          <span style={{ fontSize:18, fontWeight:700, color:T.bid, fontFamily:T.mono }}>
            {mid ? mid.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 }) : "—"}
          </span>
          {spread > 0 && (
            <span style={{ fontSize:11, color:T.muted, fontFamily:T.mono }}>
              Spread: {spread.toFixed(2)}
            </span>
          )}
        </div>

        {/* Live stats from analytics */}
        {analytics && (
          <div style={{ display:"flex", gap:18, fontSize:11, color:T.muted }}>
            {[
              ["VWAP", analytics.vwap?.toFixed(2) || "—"],
              ["Trades", analytics.tradeCount],
              ["Volume", analytics.totalVolume],
              ["Bid Depth", analytics.bidDepth],
              ["Ask Depth", analytics.askDepth],
            ].map(([k,v]) => (
              <div key={k} style={{ display:"flex", flexDirection:"column", gap:1 }}>
                <span style={{ fontSize:10 }}>{k}</span>
                <span style={{ color:T.text, fontFamily:T.mono }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex:1 }} />

        {/* Navigation */}
        <div style={{ display:"flex", gap:6 }}>
          <NavBtn label="Dashboard" active={page==="trading"}   onClick={() => setPage("trading")} />
          <NavBtn label="Analytics" active={page==="analytics"} onClick={() => setPage("analytics")} />
        </div>
        <Divider />
        <div style={{ display:"flex", gap:6 }}>
          <NavBtn label="LIVE"   active={mode==="live"}   onClick={() => { setMode("live"); fetchAll(); }} />
          <NavBtn label="REPLAY" active={mode==="replay"} onClick={() => { setMode("replay"); setReplayIdx(0); }} />
        </div>
        <Divider />

        {/* DB connection indicator */}
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <div style={{ width:6, height:6, borderRadius:"50%",
            background: dbConnected ? T.bid : T.ask,
            boxShadow: `0 0 5px ${dbConnected ? T.bid : T.ask}` }} />
          <span style={{ fontSize:10, color:T.muted, fontFamily:T.mono }}>
            {dbConnected ? "DB:CONNECTED" : "DB:OFFLINE"}
          </span>
        </div>

        <span style={{ fontSize:11, fontFamily:T.mono, color:T.muted, minWidth:64 }}>{clock}</span>
      </div>

      {/* ══ REPLAY CONTROL BAR ═══════════════════════════════ */}
      {mode === "replay" && (
        <ReplayBar idx={replayIdx} total={totalEvents} onStep={handleStep} onClose={() => { setMode("live"); fetchAll(); }} />
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
                {instrument.symbol} · VWAP: {analytics?.vwap?.toFixed(2) || "—"}
              </span>
            </div>

            {/* Candlestick + Volume */}
            <div style={{ flex:1, background:T.bg, minHeight:0, overflow:"hidden" }}>
              <CandlestickChart candles={candles} />
            </div>

            {/* Order lifecycle — DB-driven */}
            <OrderLifecycle orders={orders} />
          </div>

          {/* Trades tape — DB-driven */}
          <TradesTape trades={trades} />
        </div>
      ) : (
        <Analytics candles={candles} analytics={analytics} />
      )}
    </div>
  );
}
