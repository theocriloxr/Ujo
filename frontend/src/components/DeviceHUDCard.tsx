import React from 'react';
import {
  Activity,
  Lightbulb,
  Lock,
  Thermometer,
  Zap,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { DeviceCardProps } from '../types/index.ts';

export function DeviceHUDCard({ device, onToggle, isExpanded, onExpand }: DeviceCardProps) {
  const getIcon = () => {
    const active = device.state === 'on' || device.state === 'unlocked' || device.state === 'normal';
    const color = active ? 'text-[var(--accent-gold)]' : 'text-zinc-600';
    
    switch (device.type) {
      case 'light': return <Lightbulb className={color} size={18} />;
      case 'lock': return <Lock className={color} size={18} />;
      case 'climate': return <Thermometer className={color} size={18} />;
      case 'appliance': return <Zap className={color} size={18} />;
      case 'sensor': return <Activity className={color} size={18} />;
      default: return <Settings className={color} size={18} />;
    }
  };

  const isActive = device.state === 'on' || device.state === 'unlocked' || device.state === 'normal';
  const isCritical = device.state === 'critical' || device.status === 'ERROR' || device.status === 'OFFLINE';
  const powerUsage = device.powerUsage ?? 0;

  const handleReboot = (e: React.MouseEvent) => {
    e.stopPropagation();
    fetch('/api/devices/lazarus-reboot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: device.id })
    });
  };

  // Mini sparkline mock components
  const Sparkline = () => (
    <div className="flex items-end gap-0.5 h-4 opacity-50 px-2">
      {[12, 18, 14, 22, 19, 25, 20, 24, 15, 21].map((h, i) => (
        <motion.div 
          key={i}
          animate={{ height: isActive ? [`${h}%`, `${h+10}%`, `${h}%`] : '10%' }}
          transition={{ duration: 1 + Math.random(), repeat: Infinity }}
          className={`w-0.5 rounded-full ${isActive ? 'bg-[var(--accent-gold)]' : 'bg-zinc-800'}`}
        />
      ))}
    </div>
  );

  return (
    <motion.div 
      layout
      onClick={onExpand}
      className={`glass-hud p-4 flex flex-col group cursor-pointer relative transition-all duration-500 ${isActive ? 'border-[var(--accent-gold)]/40 shadow-[0_0_20px_rgba(250,204,21,0.05)]' : ''} ${isExpanded ? 'col-span-2 row-span-2 ring-1 ring-[var(--accent-gold)]/20' : ''}`}
    >
      {/* Pulsing indicator for anomalous devices */}
      {isCritical && (
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="absolute inset-0 rounded-3xl bg-red-500/20 pointer-events-none"
        />
      )}

      <div className="flex items-center gap-2 w-full min-w-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative shrink-0">
            {isCritical && (
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-lg bg-red-500/40 blur-md"
              />
            )}
            <div className={`p-3 rounded-lg border transition-all relative z-10 ${isActive ? 'bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/20 shadow-[0_0_15px_rgba(250,204,21,0.1)]' : 'bg-white/5 border-white/5'} ${isCritical ? 'border-red-500/40' : ''}`}>
              {getIcon()}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-bold tracking-tight text-white truncate">{device.name}</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="mono-data text-[9px] text-zinc-500 uppercase truncate">{device.state}</span>
              <motion.span 
                 animate={isCritical ? { 
                   opacity: [0.2, 1, 0.2],
                   scale: [1, 1.5, 1],
                   boxShadow: ["0 0 0px rgba(239,68,68,0)", "0 0 10px rgba(239,68,68,0.8)", "0 0 0px rgba(239,68,68,0)"]
                 } : { opacity: 1, scale: 1 }}
                 transition={{ duration: 1.5, repeat: Infinity }}
                 className={`w-1.5 h-1.5 shrink-0 rounded-full ${isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : isCritical ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} 
              />
              <span className="mono-data text-[7px] text-zinc-600 tracking-widest shrink-0">{device.status}</span>
            </div>
          </div>

          {isActive && device.powerUsage > 0 && (
            <div className="hidden sm:flex shrink-0 justify-end items-center">
              <Sparkline />
            </div>
          )}
          {!isActive && isCritical && (
            <motion.div 
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="flex shrink-0 text-[7px] font-black text-red-500 mono-data uppercase tracking-widest"
            >
              Ping Fail
            </motion.div>
          )}
        </div>

        <div className="shrink-0 pl-1">
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={`relative h-5 w-11 overflow-hidden rounded-full transition-colors ${isActive ? 'bg-[var(--accent-gold)]' : 'bg-white/10'}`}
          >
            <motion.div 
              animate={{ x: isActive ? 22 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-md"
            />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 border-t border-white/5 pt-6 space-y-6"
          >
             <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                   <span className="mono-data text-[7px] text-zinc-500 block mb-1 uppercase">Signal Strength</span>
                   <div className="flex items-end gap-0.5 h-3">
                      {[1,2,3,4,5].map(i => <div key={i} className={`w-1 rounded-full ${i <= 4 ? 'bg-[var(--accent-gold)]' : 'bg-zinc-800'}`} style={{ height: `${i*20}%` }} />)}
                   </div>
                </div>
                <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                   <span className="mono-data text-[7px] text-zinc-500 block mb-1 uppercase">Relay Path</span>
                   <span className="text-[10px] font-mono text-zinc-300">HUB_CENTRAL_01</span>
                </div>
             </div>

             {device.type === 'light' && (
                <div className="space-y-3">
                   <div className="flex justify-between items-center px-1">
                      <span className="mono-data text-[8px] text-zinc-500 uppercase">Luminance</span>
                      <span className="text-[10px] font-bold text-[var(--accent-gold)]">85%</span>
                   </div>
                   <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--accent-gold)] w-[85%]" />
                   </div>
                </div>
             )}

             {device.type === 'climate' && (
                <div className="space-y-3">
                   <div className="flex justify-between items-center px-1">
                      <span className="mono-data text-[8px] text-zinc-500 uppercase">Set Point</span>
                      <span className="text-[10px] font-bold text-[var(--accent-gold)]">22.5°C</span>
                   </div>
                   <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--accent-gold)] w-[65%]" />
                   </div>
                </div>
             )}

             <div className="flex gap-3 pt-2">
                <button 
                  onClick={handleReboot}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[8px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                   <RefreshCw size={10} />
                   Lazarus Reboot
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
