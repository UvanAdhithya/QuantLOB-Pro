
import React from 'react';
import { Trade, OrderSide } from '../types';

interface TradeTapeProps {
  trades: Trade[];
}

const TradeTape: React.FC<TradeTapeProps> = ({ trades }) => {
  return (
    <div className="h-full flex flex-col bg-slate-900/60 border border-slate-800 rounded overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center">
        <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Market Trades</span>
      </div>

      <div className="grid grid-cols-3 px-3 py-1 text-[9px] font-bold text-slate-500 border-b border-slate-800 uppercase tracking-tighter">
        <span>Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Time</span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {trades.map((trade) => (
          <div key={trade.id} className="grid grid-cols-3 px-3 h-6 items-center text-[10px] mono hover:bg-slate-800 transition-colors">
            <span className={trade.aggressorSide === OrderSide.BUY ? 'text-emerald-400' : 'text-rose-400'}>
              {trade.price.toFixed(2)}
            </span>
            <span className="text-right text-slate-300">
              {trade.quantity.toFixed(4)}
            </span>
            <span className="text-right text-slate-500">
              {new Date(trade.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TradeTape;
