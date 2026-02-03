
import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { Trade } from '../types';

interface PriceChartProps {
  trades: Trade[];
}

const PriceChart: React.FC<PriceChartProps> = ({ trades }) => {
  // Simple trade visualization. In a real app, this would be candles.
  const data = trades.slice().reverse().map(t => ({
    time: new Date(t.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
    price: t.price,
    side: t.aggressorSide
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 p-2 rounded shadow-lg text-[10px] mono">
          <p className="text-slate-400">{payload[0].payload.time}</p>
          <p className="text-white font-bold">${payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full w-full flex flex-col">
      <div className="px-4 py-2 flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center space-x-4">
          <span className="text-[11px] font-bold text-slate-400 tracking-wider">MARKET PRICE</span>
          <div className="flex space-x-1">
            {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
              <button key={tf} className={`px-2 py-0.5 text-[10px] rounded ${tf === '1m' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[10px] text-slate-500 flex space-x-3">
          <span>O: 45012.3</span>
          <span>H: 45150.0</span>
          <span>L: 44980.2</span>
          <span>C: 45055.1</span>
        </div>
      </div>
      
      <div className="flex-1 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="time" 
              hide={true}
            />
            <YAxis 
              domain={['auto', 'auto']} 
              orientation="right" 
              tick={{ fontSize: 10, fill: '#64748b' }} 
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => val.toLocaleString()}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="price" 
              stroke="#6366f1" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorPrice)" 
              isAnimationActive={false}
            />
            {trades.length > 0 && (
              <ReferenceLine y={trades[0].price} stroke="#475569" strokeDasharray="3 3" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PriceChart;
