
import React, { useEffect } from 'react';
import OrderBook from './OrderBook';
import PriceChart from './PriceChart';
import TradeTape from './TradeTape';
import OrderLifecycle from './OrderLifecycle';
import { AppMode, MarketState } from '../types';

interface DashboardProps {
  marketState: MarketState;
  setMode: (mode: AppMode) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ marketState, setMode }) => {
  useEffect(() => {
    setMode(AppMode.LIVE);
  }, [setMode]);

  return (
    <div className="h-full w-full grid grid-cols-12 grid-rows-6 p-1 gap-1">
      {/* Left: Order Book (3 cols, 4 rows) */}
      <div className="col-span-3 row-span-4 min-h-0">
        <OrderBook bids={marketState.bids} asks={marketState.asks} lastPrice={marketState.lastPrice} />
      </div>

      {/* Center: Chart (6 cols, 4 rows) */}
      <div className="col-span-6 row-span-4 min-h-0 bg-slate-900/30 border border-slate-800 rounded overflow-hidden">
        <PriceChart trades={marketState.trades} />
      </div>

      {/* Right: Trade Tape (3 cols, 4 rows) */}
      <div className="col-span-3 row-span-4 min-h-0">
        <TradeTape trades={marketState.trades} />
      </div>

      {/* Bottom: Order Lifecycle (12 cols, 2 rows) */}
      <div className="col-span-12 row-span-2 min-h-0">
        <OrderLifecycle 
          active={marketState.activeOrders} 
          completed={marketState.completedOrders} 
          cancelled={marketState.cancelledOrders} 
        />
      </div>
    </div>
  );
};

export default Dashboard;
