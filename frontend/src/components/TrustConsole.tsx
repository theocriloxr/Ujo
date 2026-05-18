import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { HAStatus, TrustLog } from '../types/index.ts';

interface TrustConsoleProps {
  trustLogs: TrustLog[];
  haStatus: HAStatus | null;
  onSyncHA: () => void;
}

export const TrustConsole: React.FC<TrustConsoleProps> = ({ trustLogs, haStatus, onSyncHA }) => (
  <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
    <div className="glass-hud flex flex-col h-[400px] border-dashed">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        <span className="mono-data text-[10px] text-[var(--accent-gold)] font-bold">Autonomous Decision Log</span>
        <div className="w-2 h-2 rounded-full bg-[var(--accent-gold)] animate-pulse" />
      </div>
      <div className="p-4 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
        {trustLogs.length === 0 ? (
          <p className="text-[10px] text-zinc-600 font-mono py-4">SYSTEM_IDLE: Awaiting context vectors...</p>
        ) : (
          trustLogs.map((log) => (
            <div
              key={log.id}
              className={`text-[11px] font-mono leading-relaxed ${log.message.includes('CRITICAL') ? 'text-red-400' : 'text-zinc-400'}`}
            >
              <span className="opacity-40 text-[9px] mr-2">
                [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]
              </span>
              {log.message}
            </div>
          ))
        )}
      </div>
      <div className="p-4 border-t border-white/10 bg-black/40">
        <span className="text-[8px] mono-data tech-text-dim">FRIDAY_CORE: Ready to intervene</span>
      </div>
    </div>

    <div className="glass-hud p-6">
      <span className="mono-data text-[10px] text-zinc-400 block mb-2 tracking-widest">Bridged Matrix Status</span>
      <div className="flex items-center gap-4 p-3 bg-white/5 border border-white/10 rounded-xl">
        <div className={`indicator ${haStatus?.connected ? 'active' : ''}`} />
        <div className="flex-1">
          <span className="block text-[10px] font-black uppercase text-white">{haStatus?.hub}</span>
          <span className="text-[8px] mono-data tech-text-dim">{haStatus?.syncedDevices} Entities Linked</span>
        </div>
        <button type="button" onClick={onSyncHA} className="p-2 text-zinc-500 hover:text-white">
          <RefreshCw size={12} />
        </button>
      </div>
    </div>

    <div className="glass-hud p-6 bg-gradient-to-br from-[var(--accent-gold)]/5 to-transparent">
      <span className="mono-data text-[10px] text-zinc-400 block mb-4 uppercase">Load Shedding Impact</span>
      <span className="block text-3xl font-black italic text-[var(--accent-gold)]">142.8 kWh</span>
      <span className="text-[9px] mono-data text-zinc-500 tracking-tighter mt-1 block">
        Cumulative offset since activation
      </span>
    </div>
  </div>
);
