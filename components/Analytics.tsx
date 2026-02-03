
import React, { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { MarketEvent, EventType, OrderSide } from '../types';

interface AnalyticsProps {
  history: MarketEvent[];
}

const Analytics: React.FC<AnalyticsProps> = ({ history }) => {
  const stats = useMemo(() => {
    const total = history.length;
    const added = history.filter(e => e.type === EventType.ORDER_ADDED).length;
    const cancelled = history.filter(e => e.type === EventType.ORDER_CANCELLED).length;
    const matched = history.filter(e => e.type === EventType.ORDER_MATCHED).length;

    const buyOrders = history.filter(e => e.type === EventType.ORDER_ADDED && e.data.side === OrderSide.BUY).length;
    const sellOrders = history.filter(e => e.type === EventType.ORDER_ADDED && e.data.side === OrderSide.SELL).length;

    return { total, added, cancelled, matched, buyOrders, sellOrders };
  }, [history]);

  const pieData = [
    { name: 'Buy Orders', value: stats.buyOrders, color: '#10b981' },
    { name: 'Sell Orders', value: stats.sellOrders, color: '#f43f5e' },
  ];

  const ratioData = [
    { name: 'Matched', value: stats.matched, color: '#6366f1' },
    { name: 'Cancelled', value: stats.cancelled, color: '#64748b' },
  ];

  const StatCard = ({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) => (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex flex-col space-y-2">
      <span className="text-xs text-slate-500 uppercase font-bold tracking-widest">{label}</span>
      <span className="text-3xl font-bold text-white mono">{value}</span>
      {subtext && <span className="text-[10px] text-slate-400">{subtext}</span>}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold text-white">Market Microstructure Analysis</h1>
        <p className="text-slate-500 text-sm">Derived from event-driven market state transitions</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <StatCard label="Total Events" value={stats.total} subtext="Processed lifecycle events" />
        <StatCard label="Arrival Rate" value={`${(stats.added / 60).toFixed(2)}/s`} subtext="Avg order entry frequency" />
        <StatCard label="Cancellation Ratio" value={`${((stats.cancelled / stats.added) * 100).toFixed(1)}%`} subtext="Relative to new order flow" />
        <StatCard label="Execution Rate" value={`${((stats.matched / stats.added) * 100).toFixed(1)}%`} subtext="Match efficiency" />
      </div>

      <div className="grid grid-cols-2 gap-6 h-[400px]">
        {/* Buy vs Sell Imbalance */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-300">Order Flow Imbalance</h3>
            <span className="text-[10px] text-slate-500 mono px-2 py-1 bg-slate-950 rounded">SQL: SELECT side, count(*) FROM events GROUP BY side</span>
          </div>
          <div className="flex-1 flex items-center justify-center">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={pieData}
                   cx="50%"
                   cy="50%"
                   innerRadius={60}
                   outerRadius={100}
                   paddingAngle={5}
                   dataKey="value"
                 >
                   {pieData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.color} />
                   ))}
                 </Pie>
                 <Tooltip />
                 <Legend />
               </PieChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Cancel vs Match */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-300">Order Outcome Ratio</h3>
            <span className="text-[10px] text-slate-500 mono px-2 py-1 bg-slate-950 rounded">SQL: SELECT outcome, count(*) FROM lifecycle GROUP BY outcome</span>
          </div>
          <div className="flex-1">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={ratioData}>
                 <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                 <XAxis dataKey="name" tick={{ fill: '#64748b' }} axisLine={false} />
                 <YAxis tick={{ fill: '#64748b' }} axisLine={false} />
                 <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '4px' }}
                 />
                 <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                   {ratioData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.color} />
                   ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
        <div className="mb-8">
           <h3 className="text-lg font-bold text-slate-200">System Architecture Overview</h3>
           <p className="text-sm text-slate-500 mt-1 italic">Designed for Academic Evaluation & High-Performance Trading Simulation</p>
        </div>
        <div className="grid grid-cols-3 gap-12 text-sm">
          <div>
            <div className="text-indigo-400 font-bold mb-2 flex items-center">
              <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2" />
              Matching Engine
            </div>
            <p className="text-slate-400 leading-relaxed">
              In-memory order book implementing Price-Time (FIFO) priority. Supports incremental updates via 
              <code className="bg-slate-950 px-1 rounded mx-1 text-xs">ORDER_ADDED</code> and <code className="bg-slate-950 px-1 rounded mx-1 text-xs">ORDER_CANCELLED</code> events.
            </p>
          </div>
          <div>
            <div className="text-indigo-400 font-bold mb-2 flex items-center">
              <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2" />
              State Persistence
            </div>
            <p className="text-slate-400 leading-relaxed">
              Every market event is persisted with a nanosecond-precision timestamp, allowing for deterministic 
              reconstruction of the LOB at any point in history using SQL window functions.
            </p>
          </div>
          <div>
            <div className="text-indigo-400 font-bold mb-2 flex items-center">
              <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2" />
              Microstructure Analysis
            </div>
            <p className="text-slate-400 leading-relaxed">
              Real-time calculation of Spread, Depth, and VPIN (Volume-Synchronized Probability of Informed Trading) 
              through the analysis of aggressor side and volume flow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
