
import React, { useState } from 'react';
import { Order, OrderSide } from '../types';

interface OrderLifecycleProps {
  active: Order[];
  completed: any[];
  cancelled: Order[];
}

const OrderLifecycle: React.FC<OrderLifecycleProps> = ({ active, completed, cancelled }) => {
  const [tab, setTab] = useState<'active' | 'completed' | 'cancelled'>('active');

  const tabs = [
    { id: 'active', label: 'Active Orders', count: active.length },
    { id: 'completed', label: 'Trade History', count: completed.length },
    { id: 'cancelled', label: 'Canceled', count: cancelled.length },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-900/40 border border-slate-800 rounded overflow-hidden">
      <div className="flex px-4 border-b border-slate-800 bg-slate-900/80">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider relative transition-colors ${
              tab === t.id ? 'text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 px-1 rounded-full bg-slate-800 text-[9px] text-slate-500">
                {t.count}
              </span>
            )}
            {tab === t.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px] mono">
          <thead className="sticky top-0 bg-slate-900 text-slate-500 font-bold uppercase text-[9px] border-b border-slate-800">
            <tr>
              <th className="px-4 py-2 text-left">Time</th>
              <th className="px-4 py-2 text-left">Order ID</th>
              <th className="px-4 py-2 text-left">Side</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">Filled</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {(tab === 'active' ? active : tab === 'completed' ? completed : cancelled).map((o) => (
              <tr key={o.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-2 text-slate-500">{new Date(o.timestamp).toLocaleTimeString()}</td>
                <td className="px-4 py-2 text-slate-400">#{o.id}</td>
                <td className={`px-4 py-2 font-bold ${o.side === OrderSide.BUY ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {o.side}
                </td>
                <td className="px-4 py-2 text-right text-slate-200">${o.price.toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-slate-300">{((o.originalQty - (o.remainingQty || 0))).toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-slate-300">{o.originalQty.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">
                  <span className={`px-2 py-0.5 rounded text-[9px] ${
                    o.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                    o.status === 'CANCELLED' ? 'bg-slate-700/50 text-slate-400' : 'bg-indigo-500/10 text-indigo-400'
                  }`}>
                    {o.status}
                  </span>
                </td>
              </tr>
            ))}
            {(tab === 'active' ? active : tab === 'completed' ? completed : cancelled).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-600 italic">
                  No records found in this category
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrderLifecycle;
