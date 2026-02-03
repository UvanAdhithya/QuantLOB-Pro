
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  Activity, 
  History, 
  BarChart3, 
  Settings, 
  Wifi, 
  WifiOff, 
  Database,
  Play,
  Pause,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import ReplayView from './components/ReplayView';
import Analytics from './components/Analytics';
import { AppMode, MarketState, MarketEvent, EventType, OrderSide, OrderStatus, Level } from './types';
import { generateHistory, createOrderEvent } from './services/mockDataService';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.LIVE);
  const [isConnected, setIsConnected] = useState(true);
  const [marketState, setMarketState] = useState<MarketState>({
    bids: [],
    asks: [],
    trades: [],
    activeOrders: [],
    completedOrders: [],
    cancelledOrders: [],
    lastPrice: 45000,
    timestamp: Date.now()
  });

  const [eventHistory, setEventHistory] = useState<MarketEvent[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);

  // Initialize with some history
  useEffect(() => {
    const seed = generateHistory(100);
    setEventHistory(seed);
  }, []);

  const processEvent = useCallback((event: MarketEvent, state: MarketState): MarketState => {
    const newState = { ...state, timestamp: event.timestamp };

    switch (event.type) {
      case EventType.ORDER_ADDED: {
        const { id, side, price, quantity } = event.data;
        // Update Active Orders
        newState.activeOrders = [...newState.activeOrders, {
          id, side, price, originalQty: quantity, remainingQty: quantity, timestamp: event.timestamp, status: OrderStatus.ACTIVE
        }];

        // Update LOB levels
        const targetBook = side === OrderSide.BUY ? 'bids' : 'asks';
        const levels = [...newState[targetBook]];
        const levelIdx = levels.findIndex(l => l.price === price);
        if (levelIdx > -1) {
          levels[levelIdx] = { 
            ...levels[levelIdx], 
            quantity: levels[levelIdx].quantity + quantity,
            orderCount: levels[levelIdx].orderCount + 1
          };
        } else {
          levels.push({ price, quantity, orderCount: 1 });
        }
        newState[targetBook] = levels.sort((a, b) => side === OrderSide.BUY ? b.price - a.price : a.price - b.price);
        break;
      }
      case EventType.ORDER_CANCELLED: {
        const order = newState.activeOrders.find(o => o.id === event.data.orderId);
        if (order) {
          newState.activeOrders = newState.activeOrders.filter(o => o.id !== order.id);
          newState.cancelledOrders = [{ ...order, status: OrderStatus.CANCELLED }, ...newState.cancelledOrders].slice(0, 50);
          
          const targetBook = order.side === OrderSide.BUY ? 'bids' : 'asks';
          const levels = [...newState[targetBook]];
          const levelIdx = levels.findIndex(l => l.price === order.price);
          if (levelIdx > -1) {
            const newQty = levels[levelIdx].quantity - order.remainingQty;
            if (newQty <= 0) {
              levels.splice(levelIdx, 1);
            } else {
              levels[levelIdx] = { 
                ...levels[levelIdx], 
                quantity: newQty,
                orderCount: levels[levelIdx].orderCount - 1
              };
            }
          }
          newState[targetBook] = levels;
        }
        break;
      }
      case EventType.ORDER_MATCHED: {
        // Simplified matching: update trades and last price
        const { price, quantity, side, tradeId } = event.data;
        newState.lastPrice = price;
        newState.trades = [{
          id: tradeId,
          timestamp: event.timestamp,
          price,
          quantity,
          aggressorSide: side
        }, ...newState.trades].slice(0, 50);

        // Reduce from LOB (assuming fill from top)
        const oppositeBook = side === OrderSide.BUY ? 'asks' : 'bids';
        const levels = [...newState[oppositeBook]];
        if (levels.length > 0) {
           let remainingToFill = quantity;
           while (remainingToFill > 0 && levels.length > 0) {
              if (levels[0].quantity <= remainingToFill) {
                remainingToFill -= levels[0].quantity;
                levels.shift();
              } else {
                levels[0] = { ...levels[0], quantity: levels[0].quantity - remainingToFill };
                remainingToFill = 0;
              }
           }
           newState[oppositeBook] = levels;
        }
        break;
      }
    }
    return newState;
  }, []);

  // Live simulation loop
  useEffect(() => {
    if (mode !== AppMode.LIVE || !isConnected) return;

    const interval = setInterval(() => {
      const event = createOrderEvent();
      setMarketState(prev => processEvent(event, prev));
      setEventHistory(prev => [...prev, event]);
    }, 1000);

    return () => clearInterval(interval);
  }, [mode, isConnected, processEvent]);

  // Handle Replay Jump
  const handleReplaySeek = (index: number) => {
    setReplayIndex(index);
    let tempState: MarketState = {
      bids: [], asks: [], trades: [], activeOrders: [], 
      completedOrders: [], cancelledOrders: [], lastPrice: 45000, timestamp: 0
    };
    for(let i=0; i<=index; i++) {
      tempState = processEvent(eventHistory[i], tempState);
    }
    setMarketState(tempState);
  };

  return (
    <HashRouter>
      <div className="flex h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
        {/* Sidebar Navigation */}
        <nav className="w-16 flex flex-col items-center py-6 border-r border-slate-800 space-y-8 bg-slate-900/50">
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col space-y-6">
            <Link to="/" className="p-2 hover:bg-slate-800 rounded-lg transition-colors group relative">
              <Activity className="w-5 h-5 text-slate-400 group-hover:text-indigo-400" />
              <span className="absolute left-14 bg-slate-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Dashboard</span>
            </Link>
            <Link to="/replay" className="p-2 hover:bg-slate-800 rounded-lg transition-colors group relative">
              <History className="w-5 h-5 text-slate-400 group-hover:text-indigo-400" />
              <span className="absolute left-14 bg-slate-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Replay Mode</span>
            </Link>
            <Link to="/analytics" className="p-2 hover:bg-slate-800 rounded-lg transition-colors group relative">
              <BarChart3 className="w-5 h-5 text-slate-400 group-hover:text-indigo-400" />
              <span className="absolute left-14 bg-slate-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Analytics</span>
            </Link>
          </div>
          <div className="mt-auto flex flex-col space-y-6 pb-4">
             <button 
              onClick={() => setIsConnected(!isConnected)}
              className={`p-2 rounded-lg transition-colors ${isConnected ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-rose-500 hover:bg-rose-500/10'}`}
             >
               {isConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
             </button>
             <button className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400">
               <Settings className="w-5 h-5" />
             </button>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-14 border-b border-slate-800 bg-slate-900/40 px-6 flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white flex items-center">
                  BTC / USDT 
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">SPOT</span>
                </span>
                <span className={`text-[10px] mono ${marketState.lastPrice > 45000 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ${marketState.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="h-8 w-[1px] bg-slate-800" />
              <div className="flex space-x-4">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">24h Change</span>
                  <span className="text-xs text-emerald-400 font-medium">+2.45%</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Connection</span>
                  <span className={`text-xs font-medium ${isConnected ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {isConnected ? 'Stable' : 'Disconnected'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider flex items-center space-x-2 border ${mode === AppMode.LIVE ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${mode === AppMode.LIVE ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-500'}`} />
                <span>{mode === AppMode.LIVE ? 'LIVE STREAM' : 'REPLAY MODE'}</span>
              </div>
              <div className="text-xs text-slate-400 mono px-3 py-1 bg-slate-900 rounded border border-slate-800">
                {/* Fix: Cast options to any to support fractionalSecondDigits in environments with older TS definitions */}
                {new Date(marketState.timestamp).toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 3 } as any)}
              </div>
            </div>
          </header>

          {/* Sub-Views */}
          <div className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<Dashboard marketState={marketState} setMode={setMode} />} />
              <Route path="/replay" element={
                <ReplayView 
                  marketState={marketState} 
                  history={eventHistory} 
                  currentIndex={replayIndex} 
                  onSeek={handleReplaySeek}
                  setMode={setMode}
                />
              } />
              <Route path="/analytics" element={<Analytics history={eventHistory} />} />
            </Routes>
          </div>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;
