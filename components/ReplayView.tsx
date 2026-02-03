
import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Timer } from 'lucide-react';
import OrderBook from './OrderBook';
import PriceChart from './PriceChart';
import TradeTape from './TradeTape';
import { AppMode, MarketState, MarketEvent } from '../types';

interface ReplayViewProps {
  marketState: MarketState;
  history: MarketEvent[];
  currentIndex: number;
  onSeek: (index: number) => void;
  setMode: (mode: AppMode) => void;
}

const ReplayView: React.FC<ReplayViewProps> = ({ marketState, history, currentIndex, onSeek, setMode }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setMode(AppMode.REPLAY);
  }, [setMode]);

  useEffect(() => {
    let timer: any;
    if (isPlaying && currentIndex < history.length - 1) {
      timer = setInterval(() => {
        onSeek(currentIndex + 1);
      }, 500);
    } else {
      setIsPlaying(false);
    }
    return () => clearInterval(timer);
  }, [isPlaying, currentIndex, history.length, onSeek]);

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 p-1">
      {/* Replay Controls Header */}
      <div className="h-20 bg-slate-900 border border-slate-800 rounded-lg mb-1 flex items-center px-8 space-x-12">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => onSeek(Math.max(0, currentIndex - 1))}
            className="p-2 hover:bg-slate-800 rounded text-slate-400"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
          </button>
          <button 
            onClick={() => onSeek(Math.min(history.length - 1, currentIndex + 1))}
            className="p-2 hover:bg-slate-800 rounded text-slate-400"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col space-y-2">
          <div className="flex justify-between text-[10px] text-slate-500 mono">
            <span>START: {history.length > 0 ? new Date(history[0].timestamp).toLocaleTimeString() : '--'}</span>
            <span className="text-white font-bold bg-slate-800 px-2 rounded">EVENT {currentIndex + 1} / {history.length}</span>
            <span>END: {history.length > 0 ? new Date(history[history.length-1].timestamp).toLocaleTimeString() : '--'}</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max={history.length - 1} 
            value={currentIndex} 
            onChange={(e) => onSeek(parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center">
            <Timer className="w-3 h-3 mr-1" /> Replay Time
          </span>
          <span className="text-xl mono font-semibold text-indigo-400">
            {/* Fix: Cast options to any to support fractionalSecondDigits in environments with older TS definitions */}
            {new Date(marketState.timestamp).toLocaleTimeString([], { fractionalSecondDigits: 3 } as any)}
          </span>
        </div>
      </div>

      {/* Reconstructed Grid */}
      <div className="flex-1 grid grid-cols-12 grid-rows-4 gap-1 min-h-0">
        <div className="col-span-3 row-span-4 min-h-0">
          <OrderBook bids={marketState.bids} asks={marketState.asks} lastPrice={marketState.lastPrice} />
        </div>
        <div className="col-span-6 row-span-4 min-h-0 bg-slate-900 border border-slate-800 rounded overflow-hidden">
          <PriceChart trades={marketState.trades} />
        </div>
        <div className="col-span-3 row-span-4 min-h-0">
          <TradeTape trades={marketState.trades} />
        </div>
      </div>
    </div>
  );
};

export default ReplayView;
