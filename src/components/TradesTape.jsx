import { useState, useEffect, useRef } from "react";
import { T } from "../tokens";

// ══════════════════════════════════════════════════════════
//  MARKET TRADES TAPE
// ══════════════════════════════════════════════════════════
export default function TradesTape({ trades }) {
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
