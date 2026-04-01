import { useState, useEffect, useRef } from "react";
import { T } from "../tokens";

// ══════════════════════════════════════════════════════════
//  REPLAY BAR  (historical reconstruction controls)
// ══════════════════════════════════════════════════════════
export default function ReplayBar({ idx, total, onStep, onClose }) {
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
