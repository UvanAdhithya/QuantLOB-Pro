import { useState } from "react";
import { T } from "../tokens";

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
export default function OrderBook({ book, mid }) {
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
