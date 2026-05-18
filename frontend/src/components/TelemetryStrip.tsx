import React, { useState } from 'react';
import { motion } from 'motion/react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import type { VoltagePoint } from '../types/index.ts';

export const TelemetryStrip = ({ history }: { history: VoltagePoint[] }) => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouseX(((e.clientX - rect.left) / rect.width - 0.5) * 2);
    setMouseY(((e.clientY - rect.top) / rect.height - 0.5) * 2);
  };

  const chartsData = history.slice(-30).map(d => ({
    ...d,
    power: Math.max(10, (d.voltage || 220) * 0.5 + Math.random() * 20),
    battery: Math.max(20, 85 + Math.sin(Date.now() / 5000) * 5)
  }));

  const currentData = chartsData[chartsData.length - 1] || { voltage: 0, power: 0, battery: 0 };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" onMouseMove={handleMouseMove} onMouseLeave={() => { setMouseX(0); setMouseY(0); }}>
      <div className="glass-hud p-4 h-28 flex flex-col justify-between overflow-hidden group">
        <div className="flex justify-between items-center">
          <span className="mono-data text-[8px] text-zinc-500">Voltage Meter</span>
          <span className="mono-data text-[10px] text-[var(--accent-cyan)] font-bold">{currentData.voltage}V</span>
        </div>
        <motion.div 
          animate={{ x: mouseX * 5, y: mouseY * 3 }}
          transition={{ type: "spring", damping: 25, stiffness: 120 }}
          className="h-12 w-full mt-2 relative min-h-[48px]"
        >
          <ResponsiveContainer width="99%" height="100%" minHeight={48}>
            <LineChart data={chartsData}>
              <Line type="step" dataKey="voltage" stroke="var(--accent-cyan)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
      <div className="glass-hud p-4 h-28 flex flex-col justify-between overflow-hidden group">
        <div className="flex justify-between items-center">
          <span className="mono-data text-[8px] text-zinc-500">Power Usage</span>
          <span className="mono-data text-[10px] text-[var(--accent-cyan)] font-bold">{Math.round(currentData.power)}W</span>
        </div>
        <motion.div 
          animate={{ x: mouseX * -3, y: mouseY * 6 }}
          transition={{ type: "spring", damping: 25, stiffness: 120 }}
          className="h-12 w-full mt-2 relative min-h-[48px]"
        >
          <ResponsiveContainer width="99%" height="100%" minHeight={48}>
            <LineChart data={chartsData}>
              <YAxis domain={['auto', 'auto']} hide />
              <Line type="monotone" dataKey="power" stroke="var(--accent-cyan)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
      <div className="glass-hud p-4 h-28 flex flex-col justify-between overflow-hidden group">
        <div className="flex justify-between items-center">
          <span className="mono-data text-[8px] text-zinc-500">Battery Level</span>
          <span className="mono-data text-[10px] text-[var(--accent-cyan)] font-bold">{Math.round(currentData.battery)}%</span>
        </div>
        <motion.div 
          animate={{ x: mouseX * 6, y: mouseY * -4 }}
          transition={{ type: "spring", damping: 25, stiffness: 120 }}
          className="h-12 w-full mt-2 relative min-h-[48px]"
        >
          <ResponsiveContainer width="99%" height="100%" minHeight={48}>
            <LineChart data={chartsData}>
              <YAxis domain={[0, 100]} hide />
              <Line type="monotone" dataKey="battery" stroke="var(--accent-cyan)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </div>
  );
};
