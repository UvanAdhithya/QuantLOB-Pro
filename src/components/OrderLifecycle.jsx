import { useState } from "react";
import { T } from "../tokens";

// ══════════════════════════════════════════════════════════
//  ORDER LIFECYCLE PANEL  (Active / Completed / Cancelled)
// ══════════════════════════════════════════════════════════
export default function OrderLifecycle({ orders }) {
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
