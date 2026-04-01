// ══════════════════════════════════════════════════════════
//  DESIGN TOKENS
// ══════════════════════════════════════════════════════════
export const T = {
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
export class RNG {
  constructor(seed = 42) { this.s = seed >>> 0; }
  next()        { this.s ^= this.s << 13; this.s ^= this.s >> 17; this.s ^= this.s << 5; return (this.s >>> 0) / 0xffffffff; }
  range(lo, hi) { return lo + this.next() * (hi - lo); }
  int(lo, hi)   { return Math.floor(this.range(lo, hi + 1)); }
  pick(arr)     { return arr[this.int(0, arr.length - 1)]; }
}

// ══════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════
export const INSTRUMENTS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"];
export const BASE = { "BTC/USDT": 88200, "ETH/USDT": 3450, "SOL/USDT": 185, "BNB/USDT": 590 };

// ══════════════════════════════════════════════════════════
//  MOCK DATA GENERATORS
// ══════════════════════════════════════════════════════════
export function genBook(mid, rng, levels = 16) {
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

export function genTrades(mid, rng, n = 40) {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    price:  +(mid + rng.range(-0.5, 0.5) * mid * 0.001).toFixed(2),
    qty:    +rng.range(0.0001, 0.5).toFixed(4),
    side:   rng.next() > 0.5 ? "BUY" : "SELL",
    ts:     new Date(Date.now() - i * 1800).toLocaleTimeString([], { hour12: false }),
  }));
}

export function genCandles(mid, rng, n = 80) {
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

export function genOrders(mid, rng, n = 24) {
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
