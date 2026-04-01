import { useState, useEffect, useRef } from "react";
import { T } from "../tokens";

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
//  CANDLESTICK CHART  (custom SVG — no library dependency)
// ══════════════════════════════════════════════════════════
export default function CandlestickChart({ candles }) {
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
    <div style={{ display:"flex", flexDirection:"column", width:"100%", height:"100%" }}>
      {/* Candlestick */}
      <div ref={ref} style={{ flex:1, minHeight:0, overflow:"hidden", position:"relative" }}>
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

      {/* Volume */}
      <div style={{ height:68, borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
        <VolumeBars candles={candles} />
      </div>
    </div>
  );
}
