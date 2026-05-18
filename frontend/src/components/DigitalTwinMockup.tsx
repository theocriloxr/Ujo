export const DigitalTwinMockup = () => (
  <div className="relative w-full h-[300px] lg:h-[500px] overflow-hidden rounded-3xl group">
    <div className="absolute inset-0 opacity-20" 
      style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
        transform: 'perspective(1000px) rotateX(60deg) translateY(-100px)',
        transformOrigin: 'top'
      }} 
    />
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
       <div className="w-64 h-64 border border-[var(--accent-gold)]/20 rounded-lg transform rotate-45 animate-pulse" />
       <div className="absolute w-48 h-48 border border-[var(--accent-cyan)]/20 rounded-lg transform rotate-45 scale-75" />
       <div className="absolute w-full h-full bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
    </div>
    <div className="absolute top-4 left-4 flex flex-col gap-1">
      <span className="mono-data text-[10px] text-[var(--accent-gold)]">Scan Mode: Active</span>
      <span className="mono-data text-[8px] text-zinc-500">Spatial Integrity: 98.4%</span>
    </div>
  </div>
);
