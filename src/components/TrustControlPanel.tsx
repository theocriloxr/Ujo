import React from 'react';
import { ShieldAlert, Info, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

interface ActionLog {
  id: string;
  timestamp: string;
  actionTaken: string;
  reason: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
}

interface TrustControlPanelProps {
  logs: ActionLog[];
}

export default function TrustControlPanel({ logs }: TrustControlPanelProps) {
  if (!logs || logs.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="bento-card col-span-12 lg:col-span-24 p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-full bg-blue-500/20 text-blue-400">
          <ShieldAlert size={20} />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Trust & Intelligence Log</h2>
        <span className="ml-auto text-[10px] text-zinc-500 font-mono tracking-widest uppercase">System Accountability</span>
      </div>

      <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
        {logs.slice(0, 5).map((log) => (
          <div key={log.id} className="flex gap-3 p-4 rounded-xl bg-zinc-900/50 border border-zinc-700/50 hover:border-zinc-600 transition-all">
            <div className="mt-1 flex-shrink-0">
              {log.priority === 'Critical' ? (
                <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
              ) : log.priority === 'High' ? (
                <div className="w-3 h-3 rounded-full bg-orange-400" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-semibold truncate text-white">{log.actionTaken}</span>
                <span className="text-[10px] text-zinc-500 font-mono ml-2">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-xs leading-tight text-zinc-300">
                <Info size={12} className="inline mr-1 -mt-0.5" />
                {log.reason}
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

