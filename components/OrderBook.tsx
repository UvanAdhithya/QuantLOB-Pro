
import React, { useMemo } from 'react';
import { Level } from '../types';

interface OrderBookProps {
  bids: Level[];
  asks: Level[];
  lastPrice: number;
}

const OrderBook: React.FC<OrderBookProps> = ({ bids, asks, lastPrice }) => {
  const DISPLAY_COUNT = 15;

  // Process data for display
  const processedAsks = useMemo(() => {
    const data = [...asks].slice(0, DISPLAY_COUNT).reverse();
    let cumulative = 0;
    return data.map(l => {
      cumulative += l.quantity;
      return { ...l, cumulativeQty: cumulative };
    });
  }, [asks]);

  const processedBids = useMemo(() => {
    const data = [...bids].slice(0, DISPLAY_COUNT);
    let cumulative = 0;
    return data.map(l => {
      cumulative += l.quantity;
      return { ...l, cumulativeQty: cumulative };
    });
  }, [bids]);

  const maxTotal = useMemo(() => {
    const askTotal = processedAsks[0]?.cumulativeQty || 0;
    const bidTotal = processedBids[processedBids.length - 1]?.cumulativeQty || 0;
    return Math.max(askTotal, bidTotal, 1);
  }, [processedAsks, processedBids]);

  const LevelRow = ({ level, side, max }: { level: Level; side: 'ask' | 'bid'; max: number }) => (
    <div className="relative group flex items-center h-6 text-[11px] mono cursor-default hover:bg-slate-800/50 transition-colors">
      <div 
        className={`absolute inset-y-0 right-0 ${side === 'ask' ? 'bg-rose-500/10' : 'bg-emerald-500/10'}`} 
        style={{ width: `${(level.cumulativeQty! / max) * 100}%` }} 
      />
      <div className="flex-1 px-3 z-10 grid grid-cols-3 w-full">
        <span className={`font-semibold ${side === 'ask' ? 'text-rose-400' : 'text-emerald-400'}`}>
          {level.price.toFixed(2)}
        </span>
        <span className="text-right text-slate-300">
          {level.quantity.toFixed(1)}
        </span>
        <span className="text-right text-slate-400">
          {level.cumulativeQty?.toFixed(1)}
        </span>
      </div>
      
      {/* Tooltip on hover */}
      <div className="absolute left-full ml-2 hidden group-hover:block bg-slate-800 border border-slate-700 p-2 rounded shadow-xl z-50 whitespace-nowrap">
        <div className="text-[10px] text-slate-400">Price-Time Depth</div>
        <div className="flex space-x-4">
          <div><span className="text-slate-500">Orders:</span> {level.orderCount}</div>
          <div><span className="text-slate-500">Queue:</span> FIFO</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-900/60 border border-slate-800 rounded overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center">
        <span className="text-[11px] font-bold text-slate-400 tracking-wider">ORDER BOOK</span>
        <div className="flex space-x-2 text-[10px]">
          <span className="text-slate-500">Depth: 1.0</span>
          <span className="text-slate-500">Spread: {asks.length > 0 && bids.length > 0 ? (asks[0].price - bids[0].price).toFixed(2) : '--'}</span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 px-3 py-1 text-[9px] font-bold text-slate-500 border-b border-slate-800 uppercase tracking-tighter">
        <span>Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex-1 flex flex-col justify-end overflow-hidden">
        {processedAsks.map((l, i) => (
          <LevelRow key={`ask-${l.price}`} level={l} side="ask" max={maxTotal} />
        ))}
      </div>

      <div className="h-10 border-y border-slate-800 bg-slate-900/80 flex items-center justify-center">
        <div className={`text-lg font-bold mono ${lastPrice > 45000 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {lastPrice.toFixed(2)}
          <span className="text-xs ml-1 font-normal opacity-60">USDT</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {processedBids.map((l, i) => (
          <LevelRow key={`bid-${l.price}`} level={l} side="bid" max={maxTotal} />
        ))}
      </div>
    </div>
  );
};

export default OrderBook;
