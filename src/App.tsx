import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Lightbulb, 
  Lock, 
  Thermometer, 
  Power, 
  AlertTriangle, 
  Shield, 
  Moon, 
  Settings,
  Cpu,
  ChevronRight,
  Zap,
  Mic,
  MapPin,
  Navigation,
  Send,
  Eye,
  Link,
  RefreshCw,
  Download,
  Scan,
  Smartphone,
  Battery,
  QrCode,
  Check,
  CheckCircle,
  Wind,
  ShieldAlert,
  Sparkles,
  Search,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { apiFetch, createHubSocket } from './lib/hubClient';

// --- TYPES ---
interface Device {
  id: string;
  name: string;
  type: string;
  state: string;
  status: string;
  category: string;
  isSheddable: boolean;
  powerUsage: number;
  controlProvider?: 'UNBOUND' | 'SIMULATION' | 'HOME_ASSISTANT' | 'MQTT';
  controlTarget?: string | null;
  desiredState?: string | null;
  lastCommandStatus?: 'IDLE' | 'PENDING_APPROVAL' | 'SENT' | 'COMPLETED' | 'FAILED';
  lastCommandError?: string | null;
  lastReportedAt?: string | null;
}

interface EnergyData {
  grid: string;
  voltage: number | null;
  status: string;
  battery: number | null;
  solar: number | null;
  forecast: string | null;
  totalWatts?: number | null;
  measuredAt?: string | null;
}

interface DeviceCardProps {
  device: Device;
  onToggle: () => void;
  isExpanded: boolean;
  onExpand: () => void;
}

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: string;
  timestamp: string;
  type: 'anomaly' | 'vendor' | 'energy' | 'health' | 'system' | 'security';
}

interface SystemData {
  devices: Device[];
  mode: string;
  location: string;
  updateAvailable: boolean;
  subscriptionActive: boolean;
  powerSource: 'MAINS' | 'INVERTER' | 'GENERATOR';
  duressActive: boolean;
  assistantName: string;
  voice: {
    persona: string;
    pitch: number;
    rate: number;
  };
  alerts: Alert[];
  energy: EnergyData;
  accessProfiles: any[];
  capabilities?: {
    simulation: boolean;
    manualPowerSource: boolean;
    homeAssistant: boolean;
    localVoice: boolean;
    hardwareApprovalRequired: boolean;
  };
}

interface HAStatus {
  connected: boolean;
  hub: string;
  version: string;
  syncedDevices: number;
}

// --- HUD COMPONENTS ---

const AIOrb = ({ active, isVerified }: { active: boolean, isVerified?: boolean }) => (
  <div className="relative w-12 h-12 flex items-center justify-center">
    {/* Inner Intensity Glow */}
    <motion.div 
      animate={{ 
        scale: active ? [0.8, 1.2, 0.8] : [0.9, 1.1, 0.9],
        opacity: active ? [0.3, 0.6, 0.3] : [0.05, 0.1, 0.05],
        boxShadow: active ? (isVerified ? ["0 0 20px rgba(34,211,238,0.3)", "0 0 60px rgba(34,211,238,0.5)", "0 0 20px rgba(34,211,238,0.3)"] : ["0 0 20px rgba(250,204,21,0.2)", "0 0 60px rgba(250,204,21,0.4)", "0 0 20px rgba(250,204,21,0.2)"]) : "none"
      }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      className={`absolute inset-0 rounded-full blur-xl transition-colors duration-1000 ${isVerified ? 'bg-cyan-500' : 'bg-[var(--accent-gold)]'}`}
    />
    
    {/* Main Orb Sphere */}
    <motion.div 
      animate={{ 
        boxShadow: active ? (isVerified ? [
          '0 0 30px rgba(34,211,238,0.4)',
          '0 0 80px rgba(34,211,238,0.8)',
          '0 0 30px rgba(34,211,238,0.4)'
        ] : [
          '0 0 20px rgba(250,204,21,0.2)',
          '0 0 50px rgba(250,204,21,0.6)',
          '0 0 20px rgba(250,204,21,0.2)'
        ]) : '0 0 10px rgba(250,204,21,0.1)'
      }}
      transition={{ duration: 2, repeat: Infinity }}
      className={`w-10 h-10 rounded-full relative z-10 border-t-2 border-white/20 shadow-2xl transition-all duration-1000 ${
        active 
          ? (isVerified ? 'bg-gradient-to-tr from-cyan-700 via-cyan-400 to-cyan-100 scale-110 shadow-[0_0_40px_rgba(34,211,238,0.4)]' : 'bg-gradient-to-tr from-yellow-700 via-[var(--accent-gold)] to-yellow-100 scale-110 shadow-[0_0_30px_rgba(250,204,21,0.3)]')
          : 'bg-zinc-800 border-zinc-700/50 grayscale opacity-40'
      }`}
    >
       <div className="absolute inset-1 rounded-full bg-black/20 backdrop-blur-[2px] overflow-hidden">
          <motion.div 
            animate={{ rotate: 360, opacity: active ? [0.1, 0.4, 0.1] : 0 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.4),transparent_60%)]"
          />
       </div>
    </motion.div>

    {/* Satellite Rings */}
    {active && (
      <motion.div 
        initial={{ rotate: 0, scale: 0.8, opacity: 0 }}
        animate={{ rotate: 360, scale: 1.4, opacity: 0.2 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 rounded-full border border-[var(--accent-gold)] border-dashed"
      />
    )}
  </div>
);

const DigitalTwinView = ({ alerts = [], spatialPulseMessage, expandedDeviceId, setExpandedDeviceId }: any) => {
  const [cameraFeedActive, setCameraFeedActive] = useState(false);
  const [alertLocation, setAlertLocation] = useState('Unknown Location');

  useEffect(() => {
    if (alerts.length > 0) {
      setCameraFeedActive(true);
      setAlertLocation(alerts[0]?.message.split(' ').slice(4).join(' ') || 'Front Door');
    } else {
      setCameraFeedActive(false);
    }
  }, [alerts]);

  const pingRoom = spatialPulseMessage?.replace('SONAR_PING_ACTIVE: ', '')?.toLowerCase() || null;

  return (
    <div className="relative w-full h-[300px] lg:h-[500px] overflow-hidden rounded-3xl bg-[#080808] border border-white/5 group shadow-2xl">
      <div className="absolute inset-0 opacity-10" 
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          transform: 'perspective(1000px) rotateX(60deg) translateY(-100px)',
          transformOrigin: 'top'
        }} 
      />
      
      {/* 3D Isometric Home Layout */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
        <motion.div 
          initial={false}
          animate={{ scale: expandedDeviceId ? 0.9 : 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="relative w-[300px] h-[300px] lg:w-[400px] lg:h-[400px] transform transition-transform duration-1000" 
          style={{ transform: 'perspective(1200px) rotateX(60deg) rotateZ(45deg)' }}
        >
          {/* Base Platform */}
          <div className="absolute inset-x-0 bottom-0 top-10 lg:top-0 bg-white/5 border border-white/10 shadow-[0_50px_100px_rgba(0,0,0,1)]" />

          {/* Rooms Map */}
          {[
            { id: 'living', name: 'Living Room', x: '10%', y: '10%', w: '40%', h: '40%' },
            { id: 'kitchen', name: 'Kitchen', x: '50%', y: '10%', w: '40%', h: '30%' },
            { id: 'bedroom', name: 'Master Bedroom', x: '50%', y: '40%', w: '40%', h: '50%' },
            { id: 'hallway', name: 'Hallway', x: '10%', y: '50%', w: '40%', h: '40%' },
          ].map((room) => {
             const isAlert = alerts.some((a: any) => a.message.toLowerCase().includes(room.name.toLowerCase()));
             const isPinged = pingRoom === room.name.toLowerCase();
             
             // Expand mapping: check if the expanded device name implies this room
             const isExpanded = expandedDeviceId && String(expandedDeviceId).toLowerCase().includes(room.name.split(' ')[0].toLowerCase());
             const isActive = isExpanded || isAlert || isPinged;

             return (
               <div
                 key={room.id}
                 className={`absolute transition-all duration-700 cursor-pointer overflow-visible ${
                   isAlert ? 'bg-red-500/20 shadow-[inset_0_0_20px_rgba(239,68,68,0.5)]' 
                   : isExpanded ? 'bg-cyan-500/10 shadow-[inset_0_0_15px_rgba(34,211,238,0.3)] border-transparent' 
                   : isPinged ? 'bg-cyan-500/20 border-cyan-400'
                   : 'bg-white/5 border-white/10 hover:bg-white/10'
                 }`}
                 style={{ left: room.x, top: room.y, width: room.w, height: room.h }}
                 onClick={() => setExpandedDeviceId?.(expandedDeviceId === room.name ? null : room.name)}
               >
                  {/* Walls (3D illusion) */}
                  <div className={`absolute top-0 right-[-5px] w-[5px] h-full origin-left skew-y-[-45deg] bg-white/10 pointer-events-none transition-colors duration-700 ${isAlert ? 'bg-red-500/30' : ''}`} />
                  <div className={`absolute bottom-[-5px] left-0 w-full h-[5px] origin-top skew-x-[-45deg] bg-white/5 pointer-events-none transition-colors duration-700 ${isAlert ? 'bg-red-500/20' : ''}`} />

                  {/* Hotspot node indicator */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className={`w-2 h-2 rounded-full transition-all duration-1000 ${
                      isAlert ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,1)]' 
                      : isActive ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]' 
                      : 'bg-zinc-600'
                    }`} />
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center -rotate-45 pointer-events-none pointer-events-none">
                     <span className={`mono-data font-bold tracking-widest text-[8px] lg:text-[10px] transition-colors duration-500 ${
                       isAlert ? 'text-red-400' : isActive ? 'text-cyan-400' : 'text-zinc-500'
                     }`}>{room.name.toUpperCase()}</span>
                  </div>
                  
                  {/* Spatial Ripples (Pulse/Ping) */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      >
                         <motion.div
                           initial={{ scale: 0, opacity: 0.8 }}
                           animate={{ scale: 2.5, opacity: 0 }}
                           transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                           className={`w-12 h-12 rounded-full border-2 ${isAlert ? 'border-red-500' : 'border-cyan-400'}`}
                         />
                         <motion.div
                           initial={{ scale: 0, opacity: 0.6 }}
                           animate={{ scale: 3.5, opacity: 0 }}
                           transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
                           className={`absolute w-12 h-12 rounded-full border border-dashed ${isAlert ? 'border-red-400' : 'border-cyan-300'}`}
                         />
                      </motion.div>
                    )}
                  </AnimatePresence>
               </div>
             )
          })}
        </motion.div>
      </div>
      
      {/* Real-time Low Resolution Camera Feed Overlay on Security Alert */}
      <AnimatePresence>
        {cameraFeedActive && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20 }}
            className="absolute right-4 top-16 md:right-8 md:top-8 w-48 h-32 md:w-64 md:h-48 border border-red-500/30 rounded-lg overflow-hidden bg-black shadow-[0_10px_40px_rgba(239,68,68,0.3)] z-50 group font-mono"
          >
             {/* Noise or static video effect mask */}
             <div className="absolute inset-0 opacity-[0.15] mix-blend-overlay z-10 pointer-events-none" 
                  style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
             
             {/* Scanlines */}
             <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_4px] pointer-events-none z-10" />

             {/* Base low-res image */}
             <div className="relative w-full h-full flex items-center justify-center grayscale contrast-150 brightness-90 sepia-[0.3] hue-rotate-[-30deg]">
               <img src="https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&q=10&w=300&h=200" alt="Camera Feed" className="w-full h-full object-cover blur-[2px] opacity-70" />
             </div>
             
             {/* Overlay HUD */}
             <div className="absolute top-2 left-2 flex items-center gap-1.5 z-20">
               <motion.div 
                 animate={{ opacity: [1, 0, 1] }} 
                 transition={{ duration: 1, repeat: Infinity }}
                 className="w-1.5 h-1.5 rounded-full bg-red-500" 
               />
               <span className="text-red-500 text-[8px] font-bold tracking-widest leading-none">REC</span>
             </div>
             <div className="absolute bottom-2 left-2 z-20">
               <span className="text-white/60 text-[7px] uppercase tracking-wider">{alertLocation} SENSOR</span>
             </div>
             <div className="absolute top-2 right-2 z-20">
               <span className="text-[7px] text-white/50">{new Date().toISOString().substring(11, 19)}Z</span>
             </div>
             <div className="absolute inset-0 pointer-events-none z-30 ring-1 ring-inset ring-red-500/20" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-4 left-4 flex flex-col gap-1 z-10 bg-[#080808]/80 backdrop-blur-sm p-3 rounded-lg border border-white/5">
        <span className="mono-data text-[10px] text-[var(--accent-gold)]">Global Spatial Map</span>
        <span className="mono-data text-[8px] text-zinc-400">View: Isometric Top-Down</span>
      </div>
    </div>
  )
}


const TelemetryStrip = ({ history, energy }: { history: any[]; energy?: EnergyData }) => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouseX(((e.clientX - rect.left) / rect.width - 0.5) * 2);
    setMouseY(((e.clientY - rect.top) / rect.height - 0.5) * 2);
  };

  const chartsData = history.slice(-30).map(d => ({
    ...d,
    power: energy?.totalWatts ?? 0,
    battery: energy?.battery ?? 0
  }));

  const currentData = chartsData[chartsData.length - 1] || {
    voltage: energy?.voltage ?? 0,
    power: energy?.totalWatts ?? 0,
    battery: energy?.battery ?? 0
  };

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

const VoiceCommandOverlay = ({ isOpen, onClose, onSend, onRecord, recording, transcribing, input, setInput, activeZone, voiceConfidence, isVoiceVerified }: {
  isOpen: boolean, 
  onClose: () => void, 
  onSend: (e: React.FormEvent) => void, 
  onRecord: () => void,
  recording: boolean,
  transcribing: boolean,
  input: string, 
  setInput: (s: string) => void,
  activeZone: string,
  voiceConfidence: number,
  isVoiceVerified: boolean
}) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[200] flex flex-col items-center justify-center p-6 text-center"
      >
        <button 
          onClick={onClose} 
          className="absolute top-10 right-10 text-zinc-500 hover:text-white p-4 group flex flex-col items-center gap-2"
        >
           <VolumeX size={32} />
           <span className="text-[8px] font-mono opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">[ESC] CLOSE</span>
        </button>

        <motion.div 
          animate={{ 
            scale: recording ? [1, 1.2, 1] : [1, 1.05, 1],
            boxShadow: ["0 0 20px rgba(250,204,21,0.2)", "0 0 60px rgba(250,204,21,0.4)", "0 0 20px rgba(250,204,21,0.2)"]
          }}
          transition={{ duration: recording ? 0.8 : 2, repeat: Infinity }}
          className="w-32 h-32 rounded-full border-4 flex items-center justify-center mb-10 bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]"
        >
           <Mic size={48} className={recording ? 'text-red-400' : 'text-[var(--accent-gold)]'} />
        </motion.div>

        <div className="max-w-2xl w-full">
           <div className="flex flex-col items-center gap-4 mb-12">
              <span className="mono-data text-xs tracking-[0.5em] uppercase text-[var(--accent-gold)]">
                {transcribing ? 'Transcribing locally' : recording ? `Recording in ${activeZone}` : 'Voice is input, not identity'}
              </span>
               <div className="flex flex-col items-center gap-2 w-full max-w-sm">
                 <div className="flex items-center justify-between w-full mb-1">
                    <span className="mono-data text-[8px] text-zinc-500 uppercase tracking-widest">Transcript confidence (not identity)</span>
                    <motion.span 
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className={`text-[10px] font-black mono-data ${voiceConfidence > 80 ? 'text-green-500' : 'text-yellow-500'}`}
                    >
                      {voiceConfidence.toFixed(1)}%
                    </motion.span>
                 </div>
                 <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      key="confidence-meter"
                      initial={{ width: 0 }}
                      animate={{ width: `${voiceConfidence}%` }}
                      transition={{ type: "spring", damping: 15, stiffness: 60 }}
                      className={`h-full transition-colors duration-1000 ${voiceConfidence > 90 ? 'bg-cyan-400' : voiceConfidence > 80 ? 'bg-green-500' : 'bg-yellow-500'}`}
                    />
                 </div>
                 {false && isVoiceVerified && (
                   <motion.span 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[8px] text-cyan-400 font-bold uppercase tracking-[0.3em] mt-2"
                   >
                     Signature Verified • Match Confirmed
                   </motion.span>
                 )}
              </div>
           </div>

           <button type="button" onClick={onRecord} disabled={transcribing} className="mb-6 px-5 py-3 rounded-full border border-white/15 text-xs uppercase tracking-widest disabled:opacity-40">
             {recording ? 'Stop and transcribe' : 'Record locally'}
           </button>
           <form onSubmit={onSend} className="relative group">
              <input 
                autoFocus
                placeholder="Declare command..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full bg-transparent border-b-2 border-white/20 px-4 py-8 text-3xl font-black italic text-white text-center focus:outline-none focus:border-[var(--accent-gold)] transition-all placeholder:text-zinc-800"
              />
              <motion.div 
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-[var(--accent-gold)] blur-sm pointer-events-none opacity-0 group-focus-within:opacity-100" 
              />
           </form>

           <div className="mt-12 flex flex-wrap justify-center gap-4">
              {["Set lights to 20%", "Arm security", "Find my phone"].map(cmd => (
                <button 
                  key={cmd}
                  onClick={() => { setInput(cmd); }}
                  className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-500 hover:text-[var(--accent-gold)] hover:border-[var(--accent-gold)]/30 transition-all"
                >
                   {cmd}
                </button>
              ))}
           </div>
        </div>
        
        <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-10 opacity-30">
           <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="mono-data text-[8px] uppercase tracking-widest text-zinc-400">Audio HW Link: Nominal</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span className="mono-data text-[8px] uppercase tracking-widest text-zinc-400">Context Buffering: 0.2ms</span>
           </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

const DeviceHUDCard = ({ device, onToggle, isExpanded, onExpand }: DeviceCardProps) => {
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
  const isCritical = device.state === 'critical' || device.status === 'ERROR' || device.status === 'OFFLINE' || device.status === 'DEGRADED' || device.lastCommandStatus === 'FAILED';
  const isPending = device.lastCommandStatus === 'PENDING_APPROVAL' || device.lastCommandStatus === 'SENT';
  const isUnbound = !device.controlProvider || device.controlProvider === 'UNBOUND';
  const controlDisabled = isPending || isUnbound || device.type === 'sensor';

  const handleReboot = (e: React.MouseEvent) => {
    e.stopPropagation();
    apiFetch('/api/devices/lazarus-reboot', {
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
          transition={{ duration: 1.5, repeat: Infinity }}
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

      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-4">
          <div className="relative">
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
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-white">{device.name}</span>
            <div className="flex items-center gap-2">
              <span className="mono-data text-[9px] text-zinc-500 uppercase">{device.state}</span>
              <motion.span 
                 animate={isCritical ? { 
                   opacity: [0.2, 1, 0.2],
                   scale: [1, 1.5, 1],
                   boxShadow: ["0 0 0px rgba(239,68,68,0)", "0 0 10px rgba(239,68,68,0.8)", "0 0 0px rgba(239,68,68,0)"]
                 } : { opacity: 1, scale: 1 }}
                 transition={{ duration: 1.5, repeat: Infinity }}
                 className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : isCritical ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} 
              />
              <span className="mono-data text-[7px] text-zinc-600 tracking-widest">{isPending ? device.lastCommandStatus : isUnbound ? 'UNBOUND' : device.status}</span>
            </div>
          </div>
        </div>
        
        {/* Real-time Indicator Visualization */}
        <div className="flex-1 flex justify-end items-center mr-4">
           {isActive && device.powerUsage > 0 && <Sparkline />}
           {!isActive && isCritical && (
             <motion.div 
               animate={{ opacity: [0.3, 1, 0.3] }}
               transition={{ duration: 0.8, repeat: Infinity }}
               className="text-[7px] font-black text-red-500 mono-data uppercase letter-spacing-widest"
             >
               Ping Fail
             </motion.div>
           )}
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={controlDisabled}
            title={isUnbound ? 'Bind this device to Home Assistant or a provisioned Ujo node first.' : isPending ? 'Command pending confirmation.' : 'Control device'}
            onClick={(e) => { e.stopPropagation(); if (!controlDisabled) onToggle(); }}
            className={`w-10 h-5 rounded-full relative transition-all ${isActive ? 'bg-[var(--accent-gold)]' : 'bg-white/10'} ${controlDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <motion.div 
              animate={{ x: isActive ? 20 : 0 }}
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-lg"
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
};

export default function App() {
  const [data, setData] = useState<SystemData | null>(null);
  const [haStatus, setHaStatus] = useState<HAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [voltageHistory, setVoltageHistory] = useState<{ time: string, voltage: number }[]>([]);
  const [voiceInput, setVoiceInput] = useState('');
  const [nlpResponse, setNlpResponse] = useState<string | null>(null);
  const [trustScore, setTrustScore] = useState(85);
  const [activeZone, setActiveZone] = useState('Living Room');
  const [activeUser, setActiveUser] = useState('Owner');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState(0);
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<'qr' | 'voice' | 'complete'>('qr');
  const [scannedDevices, setScannedDevices] = useState<string[]>([]);
  const [spatialPulseMessage, setSpatialPulseMessage] = useState<string | null>(null);
  const [trustLogs, setTrustLogs] = useState<{ id: string, message: string, timestamp: string, type: string }[]>([]);
  const [isLocalConnection, setIsLocalConnection] = useState(false);
  const [isSaaSTier, setIsSaaSTier] = useState(false);
  const [isFindingPhone, setIsFindingPhone] = useState(false);
  const [phoneTrackingResult, setPhoneTrackingResult] = useState<any>(null);
  const [showVaultAuth, setShowVaultAuth] = useState(false);
  const [vaultAction, setVaultAction] = useState<string | null>(null);
  const [vaultPin, setVaultPin] = useState('');
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [voiceConfidence, setVoiceConfidence] = useState(0); // 0-100%
  const [isPhonePresent, setIsPhonePresent] = useState(true);
  const [isVoiceVerified, setIsVoiceVerified] = useState(false);
  const [ambientAudio, setAmbientAudio] = useState<AudioContext | null>(null);
  const [ambientGain, setAmbientGain] = useState<GainNode | null>(null);
  const [audioTheme, setAudioTheme] = useState<'deep_space' | 'nebula' | 'pulse'>('deep_space');
  const [isGlobalMuted, setIsGlobalMuted] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string>("Consider arming security protocols for the night.");
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);
  const [oscillators, setOscillators] = useState<OscillatorNode[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [guestSessions, setGuestSessions] = useState<any[]>([]);
  const [voiceSettings, setVoiceSettings] = useState<any>({ persona: 'Ujo', pitch: 1.0, speechRate: 1.0 });
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const audioContextRef = React.useRef<AudioContext | null>(null);
  const ambientAudioRef = React.useRef<AudioContext | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);

  useEffect(() => {
    setIsSaaSTier(Boolean(data?.subscriptionActive));
  }, [data?.subscriptionActive]);

  const getTTSContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  };

  const fetchGuestSessions = async () => {
    try {
      const res = await apiFetch('/api/security/guest-sessions');
      const json = await res.json();
      setGuestSessions(json);
    } catch (e) { console.error(e); }
  };

  const fetchVoiceSettings = async () => {
    try {
      const res = await apiFetch('/api/voice/settings');
      const json = await res.json();
      setVoiceSettings(json);
    } catch (e) { console.error(e); }
  };

  const saveVoiceSettings = async (settings: any) => {
    try {
      await apiFetch('/api/voice/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setVoiceSettings(settings);
    } catch (e) { console.error(e); }
  };

  const revokeGuestSession = async (id: string) => {
    const session = guestSessions.find(s => s.id === id);
    if (!session) return;

    if (!window.confirm(`Are you sure you want to revoke access for ${session.name}?`)) {
      return;
    }

    try {
      await apiFetch('/api/security/revoke-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      fetchGuestSessions();
      addTrustLog(`Guest session for ${session.name} revoked manually`, "warning");
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchGuestSessions();
    fetchVoiceSettings();
  }, [showSettings]);

  const addTrustLog = (message: string, type: 'success' | 'warning' | 'info' | 'error' = 'info') => {
    const log = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${trustLogs.length}`,
      message,
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      type
    };
    setTrustLogs(prev => [log, ...prev].slice(0, 10));

    // Update Trust Score
    const scoreMap = { success: 1, warning: -2, info: 0, error: -5 };
    setTrustScore(prev => Math.min(100, Math.max(0, prev + scoreMap[type])));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        setShowVoiceOverlay(true);
      }
      
      if (e.code === 'KeyM') {
        setIsGlobalMuted(prev => !prev);
      }
      
      if (e.key === 'Escape') {
        setShowVoiceOverlay(false);
        setIsVoiceVerified(false);
        setShowVaultAuth(false);
        setShowOnboarding(false);
        setExpandedDeviceId(null);
        setShowSettings(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // System Health Monitoring Agent
    const healthCheck = setInterval(() => {
      if (!data) return;
      data.devices.forEach(dev => {
        if (dev.status === 'ERROR' || dev.status === 'OFFLINE') {
          const hasAlert = data.alerts.some(a => a.message.includes(dev.name));
          if (!hasAlert) {
            addTrustLog(`CRITICAL: ${dev.name} node heartbeat lost. Latency threshold exceeded.`, 'error');
            speakResponse(`Alert: ${dev.name} is unresponsive. Initiating Lazarus background diagnostic.`);
          }
        }
      });
    }, 15000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(healthCheck);
    };
  }, [data]);

  const initAmbientSound = () => {
    if (ambientAudio) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const gain = ctx.createGain();
      gain.gain.value = 0; 
      gain.connect(ctx.destination);

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      
      const filter = ctx.createBiquadFilter();
      filter.frequency.setValueAtTime(150, ctx.currentTime);

      osc1.connect(gain);
      osc2.connect(filter);
      filter.connect(gain);
      
      setOscillators([osc1, osc2]);
      applyAudioTheme(audioTheme, [osc1, osc2], ctx);

      osc1.start();
      osc2.start();
      setAmbientAudio(ctx);
      setAmbientGain(gain);
      if (!isGlobalMuted) gain.gain.setTargetAtTime(0.015, ctx.currentTime, 2);
    } catch (e) {
      console.warn("Audio Context init failed", e);
    }
  };

  const applyAudioTheme = (theme: string, oscs: OscillatorNode[], ctx: AudioContext) => {
    if (oscs.length < 2) return;
    switch(theme) {
      case 'nebula':
        oscs[0].frequency.setTargetAtTime(80, ctx.currentTime, 1);
        oscs[1].frequency.setTargetAtTime(120, ctx.currentTime, 1);
        oscs[0].type = 'sine';
        oscs[1].type = 'sine';
        break;
      case 'pulse':
        oscs[0].frequency.setTargetAtTime(30, ctx.currentTime, 1);
        oscs[1].frequency.setTargetAtTime(90, ctx.currentTime, 1);
        oscs[0].type = 'square';
        oscs[1].type = 'sine';
        break;
      default: // deep_space
        oscs[0].frequency.setTargetAtTime(45, ctx.currentTime, 1);
        oscs[1].frequency.setTargetAtTime(65, ctx.currentTime, 1);
        oscs[0].type = 'sine';
        oscs[1].type = 'triangle';
    }
  };

  useEffect(() => {
    if (ambientAudio && oscillators.length > 0) {
      applyAudioTheme(audioTheme, oscillators, ambientAudio);
    }
  }, [audioTheme]);

  useEffect(() => {
    const startOnInteraction = () => {
      initAmbientSound();
      window.removeEventListener('mousedown', startOnInteraction);
    };
    
    const handleMouseMoveModulation = () => {
      if (ambientGain && ambientAudio) {
        // Boost volume slightly during movement, then let it decay
        ambientGain.gain.cancelScheduledValues(ambientAudio.currentTime);
        ambientGain.gain.setTargetAtTime(0.025, ambientAudio.currentTime, 0.1);
        ambientGain.gain.setTargetAtTime(0.012, ambientAudio.currentTime + 0.1, 4);
      }
    };

    window.addEventListener('mousedown', startOnInteraction);
    window.addEventListener('mousemove', handleMouseMoveModulation);
    return () => {
      window.removeEventListener('mousedown', startOnInteraction);
      window.removeEventListener('mousemove', handleMouseMoveModulation);
    };
  }, [ambientAudio, ambientGain]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const speakResponse = async (text: string) => {
    if (isGlobalMuted) return;
    try {
      // The hub tries local speech first; cloud is available only by explicit server configuration.
      const persona = voiceSettings.persona || 'Ujo';
      const ttsResp = await apiFetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, persona })
      });
      if (!ttsResp.ok) throw new Error(`Hub speech unavailable (${ttsResp.status})`);
      const { audio: base64Audio, encoding = 'pcm_s16le', sampleRate = 24000 } = await ttsResp.json();
      if (base64Audio) {
         const binaryString = atob(base64Audio);
         const bytes = new Uint8Array(binaryString.length);
         for (let i = 0; i < binaryString.length; i++) {
             bytes[i] = binaryString.charCodeAt(i);
         }
         
         const audioContext = getTTSContext();
         if (audioContext.state === 'suspended') {
           await audioContext.resume();
         }
         let audioBuffer: AudioBuffer;
         if (encoding === 'wav') {
           audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
         } else {
           audioBuffer = audioContext.createBuffer(1, bytes.length / 2, sampleRate);
           const channelData = audioBuffer.getChannelData(0);
           const dataView = new DataView(bytes.buffer);
           for (let i = 0; i < bytes.length / 2; i++) channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
         }
         
         const source = audioContext.createBufferSource();
         source.buffer = audioBuffer;
         // Applied dynamic rate and pitch
         source.playbackRate.value = voiceSettings.speechRate || 1.0; 
         source.detune.value = (voiceSettings.pitch - 1.0) * 1200; // 1200 cents per octave
         source.connect(audioContext.destination);
         source.start();
         
         return;
      }
    } catch (e) {
      console.warn("Hub TTS failed, falling back to the device speech engine:", e);
    }
    
    // 2. Enhanced Local Fallback (Free Tier - Non-Robotic)
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = voiceSettings.pitch || 1.0;
    utterance.rate = voiceSettings.speechRate || 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Prioritize modern Neural/Natural voices over legacy robotic ones
      const preferredVoices = voices.sort((a, b) => {
        const score = (v: SpeechSynthesisVoice) => {
          if (v.name.includes('Natural')) return 10;
          if (v.name.includes('Neural')) return 9;
          if (v.name.includes('Google') && v.name.includes('UK')) return 8;
          if (v.name.includes('Google') && v.name.includes('US')) return 7;
          if (v.name.includes('Samantha')) return 6;
          return 0;
        };
        return score(b) - score(a);
      });
      
      if (preferredVoices.length > 0) {
        utterance.voice = preferredVoices[0];
      }
    }

    // Proportional Prosody: Humans vary pitch and rate slightly
    utterance.pitch = isSaaSTier ? 1.05 : 0.95; 
    utterance.rate = isSaaSTier ? 0.95 : 1.02; // SaaS is smoother/slower, Free is efficient but clear
    
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    // Initial fetch
    fetchStates();
  }, []);

  const sendVoiceCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceInput.trim()) return;

    // Text or speech-to-text is an input method, never biometric authentication.
    setVoiceConfidence(0);
    setIsVoiceVerified(false);

    try {
      const response = await apiFetch('/api/nlp-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: voiceInput, 
          room: activeZone
        })
      });

      const result = await response.json();
      setNlpResponse(result.response);
      addTrustLog(`NLP: Command processed. ${result.response}`, result.success ? 'success' : 'info');
      
      if (result.vaultRequired) {
        setVaultAction(voiceInput);
        setShowVaultAuth(true);
      }

      speakResponse(result.response);
      setVoiceInput('');
      setShowVoiceOverlay(false);
      setTimeout(() => setNlpResponse(null), 10000);
    } catch (e) {
      addTrustLog("Voice link handshake failed", "error");
      speakResponse("System link failed.");
    }
  };

  const toggleRecording = async () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      addTrustLog('This client does not support microphone capture.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      const preferred = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        setRecording(false);
        setTranscribing(true);
        stream.getTracks().forEach(track => track.stop());
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const response = await apiFetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': blob.type.split(';')[0] },
            body: blob
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Transcription failed');
          setVoiceInput(result.text || '');
          addTrustLog(`Local transcription completed${result.language ? ` (${result.language})` : ''}.`, 'success');
        } catch (error) {
          addTrustLog(error instanceof Error ? error.message : 'Local transcription failed.', 'error');
        } finally {
          setTranscribing(false);
          recorderRef.current = null;
        }
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch {
      addTrustLog('Microphone permission was denied or unavailable.', 'error');
    }
  };

  const switchPowerSource = async (source: string) => {
    try {
      await apiFetch('/api/power-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      });
      addTrustLog(`Power source manually switched to ${source}`, 'info');
    } catch (e) {
      addTrustLog("Failed to switch power source", "error");
    }
  };
  
  const startTraining = () => {
    setIsTraining(true);
    setTrainingStep(1);
    speakResponse('Voice input calibration started. This adjusts microphone guidance only and is not identity verification.');
  };

  const nextTrainingStep = () => {
    if (trainingStep < 3) {
      setTrainingStep(prev => prev + 1);
    } else {
      setIsTraining(false);
      setTrainingStep(0);
      speakResponse('Voice input calibration complete. No biometric credential was created.');
    }
  };

  const fetchStates = async () => {
    try {
      const fetchWithLog = async (url: string) => {
        try {
          const res = await apiFetch(url);
          if (!res.ok) {
            console.warn(`Fetch to ${url} returned ${res.status}`);
          }
          return res;
        } catch (err) {
          console.error(`Fetch to ${url} network error:`, err);
          throw err;
        }
      };

      const [resStates, resHa] = await Promise.all([
        fetchWithLog('/api/states'),
        fetchWithLog('/api/ha/status')
      ]);

      if (!resStates.ok || !resHa.ok) {
        throw new Error(`Server returned error: ${resStates.status} / ${resHa.status}`);
      }

      const jsonStates = await resStates.json();
      const jsonHa = await resHa.json();
      
      // Proactive Update Speak
      setData(prevData => {
        if (jsonStates.updateAvailable && !prevData?.updateAvailable) {
          speakResponse("A system software update is available. Please review the details in the command center.");
        }

        // Proactive Alerts Speak
        if (jsonStates.alerts) {
          const newAlerts = jsonStates.alerts.filter((a: Alert) => !prevData?.alerts?.some((da: Alert) => da.id === a.id));
          newAlerts.forEach((alert: Alert) => {
            speakResponse(`New system alert: ${alert.title}. ${alert.message}`);
          });
        }
        return jsonStates;
      });

      // Update Voltage History
      setVoltageHistory(prev => {
        const voltage = Number(jsonStates.energy?.voltage);
        if (!Number.isFinite(voltage)) return prev;
        const newHistory = [...prev, { time: new Date().toLocaleTimeString(), voltage }];
        return newHistory.slice(-20); // Keep last 20 points
      });
      
      setHaStatus(jsonHa);
      setLoading(false);
    } catch (err) {
      if (err instanceof Error) {
        console.error('Failed to fetch data:', err.name, err.message);
      } else {
        console.error('Failed to fetch data:', err);
      }
    }
  };

  useEffect(() => {
    fetchStates();
    
    // WebSockets implementation to replace polling
    const socket = createHubSocket();
    socket.on('state_update', (jsonStates) => {
      setData(prevData => {
        // Proactive Update Speak
        if (jsonStates.updateAvailable && !prevData?.updateAvailable) {
          speakResponse("A system software update is available. Please review the details in the command center.");
        }

        // Proactive Alerts Speak
        if (jsonStates.alerts) {
          const newAlerts = jsonStates.alerts.filter((a: Alert) => !prevData?.alerts?.some((da: Alert) => da.id === a.id));
          newAlerts.forEach((alert: Alert) => {
            speakResponse(`New system alert: ${alert.title}. ${alert.message}`);
          });
        }
        
        return jsonStates;
      });

      // Update Voltage History
      setVoltageHistory(prev => {
        const voltage = Number(jsonStates.energy?.voltage);
        if (!Number.isFinite(voltage)) return prev;
        const newHistory = [...prev, { time: new Date().toLocaleTimeString(), voltage }];
        return newHistory.slice(-20); // Keep last 20 points
      });
    });

    socket.on('trust_log_update', (log) => {
      setTrustLogs(prev => [log, ...prev].slice(0, 20));
      // Speak the log if it's high severity
      if (log.message.includes('CRITICAL') || log.message.includes('ALERT')) {
        speakResponse(log.message);
      }
    });

    socket.on('sensor_update', (payload) => {
      // Logic for chart or real-time sensor text
      if (payload.topic.includes('power/grid')) {
        setVoltageHistory(prev => {
          const newHistory = [...prev, { time: new Date().toLocaleTimeString(), voltage: payload.data.voltage }];
          return newHistory.slice(-20);
        });
      }
    });

    socket.on('motion-detected', (payload: { room: string, timestamp: string }) => {
       addTrustLog(`MOTION_SENSOR: Activity detected in ${payload.room}`, 'warning');
       if (payload.room === 'Living Room') {
         setShowVoiceOverlay(true);
         setNlpResponse(`Motion detected in ${payload.room}. Activating peripheral surveillance.`);
         // Auto-clear after 8s
         setTimeout(() => {
           setNlpResponse(null);
           setShowVoiceOverlay(false);
         }, 8000);
       }
    });

    socket.on('phone_sonar_active', (payload) => {
       setSpatialPulseMessage(`SONAR_PING_ACTIVE: ${payload.room}`);
       setTimeout(() => setSpatialPulseMessage(null), 10000);
    });

    const p2pInterval = setInterval(checkP2P, 10000);
    checkP2P();

    // Fallback polling for HA
    const interval = setInterval(() => {
      apiFetch('/api/ha/status')
        .then(res => res.json())
        .then(jsonHa => setHaStatus(jsonHa))
        .catch(() => {});
    }, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(p2pInterval);
      socket.disconnect();
    };
  }, []);

  const [showKeypad, setShowKeypad] = useState(false);
  const [pinBuffer, setPinBuffer] = useState('');
  const [lockedActionID, setLockedActionID] = useState<string | null>(null);

  const handleKeypadPress = (num: string) => {
    if (pinBuffer.length < 4) setPinBuffer(prev => prev + num);
  };

  const submitPin = async () => {
    try {
      const res = await apiFetch('/api/security/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinBuffer })
      });
      const result = await res.json();
      if (result.success) {
        setShowKeypad(false);
        setPinBuffer('');
        speakResponse(result.message);
      } else {
        speakResponse("Access denied. Invalid signature.");
        setPinBuffer('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleDevice = async (id: string, currentState: string) => {
    const device = data?.devices.find(candidate => candidate.id === id);
    if (!device) return;

    if (device.type === 'lock' && currentState === 'locked') {
      setShowKeypad(true);
      setLockedActionID(id);
      return;
    }
    if (device.type === 'lock') {
      speakResponse('Locking through the authenticated access workflow is not yet exposed on this screen.');
      return;
    }
    if (device.type === 'sensor') return;

    const nextState = currentState.toLowerCase() === 'on' ? 'off' : 'on';
    try {
      const response = await apiFetch(`/api/devices/${encodeURIComponent(id)}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: nextState, reason: 'User dashboard control' })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Control request failed.');
      if (result.status === 'PENDING_APPROVAL') speakResponse('The hardware command is waiting for owner approval.');
      else if (result.status === 'SENT') speakResponse('Command sent. Waiting for the device to report its state.');
      await fetchStates();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Control failed.';
      addTrustLog(`CONTROL_REJECTED: ${message}`, 'warning');
      speakResponse(message);
    }
  };

  const setMode = async (mode: string) => {
    try {
      await apiFetch('/api/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      fetchStates();
    } catch (err) {
      console.error('Mode change failed', err);
    }
  };

  const confirmAlert = async (id: string, action: 'Confirm' | 'Ignore') => {
    try {
      await apiFetch('/api/hitl/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action })
      });
      fetchStates();
    } catch (err) {
      console.error('Confirm failed', err);
    }
  };

  const triggerAnomaly = async () => {
    await apiFetch('/api/anomaly', { method: 'POST' });
  };


  const handleVaultAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultError(null);
    try {
      const res = await apiFetch('/api/system/vault/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: vaultPin })
      });
      if (res.ok) {
        setShowVaultAuth(false);
        setVaultPin('');
        speakResponse("PIN confirmed. Use the dedicated access control to select the exact door and action.");
        setNlpResponse("Authentication confirmed; natural-language execution remains disabled for locks and payments.");
      } else {
        setVaultError("Invalid Security PIN");
      }
    } catch (e) {
      setVaultError("System Error");
    }
  };

  const startOnboarding = () => {
    setShowOnboarding(true);
    setOnboardingStep('qr');
    speakResponse("System initialized. Welcome to Ujo OS. Please scan the physical QR code to establish a secure link.");
  };

  const completeStep = async (step: 'qr' | 'voice') => {
    if (step === 'qr') {
      await apiFetch('/api/system/onboarding/qr-handshake', { method: 'POST' });
      setOnboardingStep('voice');
      speakResponse('Setup step confirmed. You can now test local microphone transcription.');
    } else {
      await apiFetch('/api/system/onboarding/voice-calibrate', { method: 'POST' });
      setOnboardingStep('complete');
      speakResponse('Setup complete. Voice remains a convenience input and does not authorize secure actions.');
      setTimeout(() => setShowOnboarding(false), 2000);
      addTrustLog('Voice input calibration completed; no biometric credential stored.', 'success');
    }
  };

  const toggleLocation = async () => {
    const nextLoc = data?.location === 'Home' ? 'Away' : 'Home';
    await apiFetch('/api/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: nextLoc })
    });
    fetchStates();
  };

  const simulateMotion = async () => {
    await apiFetch('/api/motion', { method: 'POST' });
    fetchStates();
  };

  const syncHA = async () => {
    await apiFetch('/api/ha/sync', { method: 'POST' });
    fetchStates();
  };

  const simulateHealthAlert = async () => {
    await apiFetch('/api/health/co2-trigger', { method: 'POST' });
    fetchStates();
  };

  const updateVoiceSetting = async (persona: string, pitch: number, rate: number) => {
    await apiFetch('/api/voice/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona, pitch, rate })
    });
    fetchStates();
    speakResponse(`Voice personality changed to ${persona}.`);
  };

  const checkP2P = async () => {
    const res = await apiFetch('/api/network/p2p-check');
    const json = await res.json();
    setIsLocalConnection(json.local);
  };

  const findMyPhone = async () => {
    setIsFindingPhone(true);
    setPhoneTrackingResult(null);
    speakResponse("Verifying BLE RSSI signatures across edge microphones. One moment.");
    
    try {
      const res = await apiFetch('/api/system/find-phone', { method: 'POST' });
      const json = await res.json();
      
      setIsFindingPhone(false);
      setPhoneTrackingResult(json);
      if (json.status === 'ONLINE') {
        speakResponse(`Triangulation successful. Your phone is currently in the ${json.room}. Playing sonar ping now.`);
      } else {
        speakResponse(json.message);
      }
    } catch (e) {
      setIsFindingPhone(false);
      speakResponse("Unable to locate phone signature. Offline logs unavailable.");
    }
  };

  const toggleSaaSTier = () => {
    speakResponse('Subscription entitlements are read-only on the hub and must be issued by the signed Ujo Cloud service.');
  };

  const checkSoftwareUpdate = async () => {
    try {
      const res = await apiFetch('/api/system/check-update', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) {
        speakResponse(result.message);
        return;
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSubscription = async () => {
    await apiFetch('/api/system/toggle-subscription', { method: 'POST' });
    const nextActive = !data?.subscriptionActive;
    speakResponse(nextActive ? "SaaS Pulse activated. Cloud features and updates enabled." : "SaaS Pulse deactivated. Offline mode only.");
  };

  const switchPower = async (source: 'Grid' | 'Inverter' | 'Generator') => {
    await apiFetch('/api/power-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source })
    });
    speakResponse(`Circuit shift. Now operating on ${source} power. Grid Guardian is scaling loads accordingly.`);
  };

  const simulatePredictive = async () => {
    await apiFetch('/api/simulate-time', { method: 'POST' });
  };

  const dispatchVendor = async (vendorType: string) => {
    try {
      await apiFetch('/api/vendor/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorType })
      });
    } catch(e) { console.error(e); }
  };

  const generateGuestQR = async () => {
    try {
      const res = await apiFetch('/api/security/guest-code', { method: 'POST' });
      const responseData = await res.json();
      if (responseData.success && responseData.qrCode) {
        speakResponse("Ephemeral QR code generated. Web-app Sandbox is active. Geofenced permissions strictly valid for 3 hours.");
        // We could display the QR code in a state, but for MVP we log it
        console.log("Guest URL:", responseData.url, "QR Base64:", responseData.qrCode);
      }
    } catch(e) { console.error(e); }
  };

  const renderTrustPanel = () => (
    <div className="bento-card bg-zinc-950/80 border-dashed border-zinc-800">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Shield className="text-[var(--accent)]" size={14} />
          <p className="text-[10px] font-mono text-zinc-100 uppercase tracking-widest">Cognitive Trust Panel</p>
        </div>
        <div className="flex gap-2">
          <button 
             onClick={() => setTrustLogs([])}
             className="text-[8px] uppercase tech-text-dim hover:text-white transition-colors"
          >
            Clear Data
          </button>
        </div>
      </div>
      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        {trustLogs.length === 0 ? (
          <p className="text-[10px] text-zinc-600 italic font-mono py-4">Waiting for autonomous system logs...</p>
        ) : (
          trustLogs.map((log) => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }} 
              animate={{ opacity: 1, x: 0 }} 
              key={log.id} 
              className={`p-3 rounded-xl border ${
                log.message.includes('CRITICAL') 
                  ? 'bg-red-500/5 border-red-500/20' 
                  : 'bg-zinc-900/50 border-zinc-800'
              }`}
            >
              <p className={`text-[10px] font-medium leading-relaxed ${
                log.message.includes('CRITICAL') ? 'text-red-400' : 'text-zinc-200'
              }`}>
                {log.message}
              </p>
              <div className="flex justify-between items-center mt-2">
                <span className="text-[8px] font-mono tech-text-dim">LOG_ENTRY_{log.id.slice(-4)}</span>
                <span className="text-[8px] font-mono tech-text-dim italic">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );

  if (loading || !data) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-4">
          <Cpu className="animate-pulse text-[var(--accent)]" size={48} />
          <p className="font-mono text-xs tech-text-dim tracking-[0.2em] uppercase italic">Initializing Ujo OS JARVIS Core...</p>
        </div>
      </div>
    );
  }  return (
    <div className="min-h-screen bg-[#050505] flex flex-col selection:bg-[var(--accent-gold)] selection:text-black p-4 lg:p-6 pb-20">
      
      {/* Top HUD Header */}
      <header className="flex justify-between items-start mb-8 z-50">
        <div className="flex flex-col">
          <h1 className="text-2xl font-black italic tracking-tighter text-[var(--accent-gold)]">UJO OS</h1>
          <span className="mono-data text-[10px] text-zinc-500 tracking-[0.4em]">Autonomous Context Engine v2.0A</span>
        </div>
        
        <div className="flex items-center gap-8">
           <div className="flex flex-col items-center gap-2 group relative">
              <div className="text-[var(--accent-gold)] font-mono text-[8px] tracking-widest uppercase">System Trust</div>
              <div className="text-2xl font-black italic text-white leading-none">{trustScore}%</div>
              <div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                 <motion.div 
                   animate={{ width: `${trustScore}%` }}
                   className={`h-full ${trustScore > 70 ? 'bg-green-500' : trustScore > 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                 />
              </div>
              
              {/* Trust Score Tooltip */}
              <div className="absolute top-full mt-2 w-48 p-3 bg-zinc-900 border border-white/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100] shadow-2xl">
                 <p className="text-[9px] text-zinc-400 leading-relaxed font-mono">
                    <span className="text-[var(--accent-gold)] font-bold uppercase block mb-1">Score Matrix:</span>
                    • System Core Stability<br/>
                    • Security Event History<br/>
                    • AI Interaction Success<br/>
                    • Voice Biometric Accuracy
                 </p>
              </div>
           </div>

           <div className="flex flex-col items-end">
              <span className="mono-data text-[10px] text-zinc-400">{activeUser} Matrix</span>
              <span className="text-xs font-bold text-white italic capitalize">{data.location}</span>
           </div>
           
           <button 
             onClick={() => setIsGlobalMuted(!isGlobalMuted)}
             className={`p-3 rounded-xl border transition-all ${isGlobalMuted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10'}`}
           >
              {isGlobalMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
           </button>

           <button 
             onClick={() => setShowSettings(true)}
             className="p-3 rounded-xl border bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 hover:text-[var(--accent-gold)] transition-all"
           >
              <Settings size={18} />
           </button>

           <AIOrb active={!!nlpResponse} isVerified={isVoiceVerified} />
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-6 items-start">
        
        {/* Left: Environment & Energy HUD */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          
          <div className="glass-hud p-6">
            <div className="flex items-center justify-between mb-6">
               <div className="flex items-center gap-2">
                  <Zap size={14} className="text-[var(--accent-gold)]" />
                  <span className="mono-data text-[10px] text-zinc-400">Grid Guardian</span>
               </div>
               {data.powerSource === 'INVERTER' && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-orange-500/20 border border-orange-500/30 rounded text-[7px] text-orange-500 font-bold animate-pulse">
                     AUTO_SHEDDING_ACTIVE
                  </div>
               )}
               {data.energy.battery < 20 && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[7px] text-red-500 font-bold animate-pulse">
                     CRITICAL_LOAD
                  </div>
               )}
            </div>
            
            <div className="flex flex-col gap-6">
               <div className="flex gap-2">
                  {['MAINS', 'INVERTER', 'GENERATOR'].map(src => (
                    <button 
                       key={src}
                       onClick={() => switchPowerSource(src)}
                       className={`flex-1 p-2 rounded-lg border text-[7px] font-black uppercase transition-all ${data.powerSource === src ? 'bg-[var(--accent-gold)] text-black border-[var(--accent-gold)]' : 'bg-white/5 border-white/10 text-zinc-500 hover:text-white'}`}
                    >
                       {src}
                    </button>
                  ))}
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                     <span className="mono-data text-[8px] text-zinc-500 uppercase">Input Feed</span>
                     <span className="text-xs font-bold text-white uppercase">{data.energy.grid === 'Connected' ? 'STABLE' : 'UNSTABLE'}</span>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                     <span className="mono-data text-[8px] text-zinc-500 uppercase">Load Status</span>
                     <span className={`text-xs font-bold tracking-widest ${data.mode === 'Sleep' ? 'text-green-400' : 'text-zinc-300'}`}>{data.mode === 'Sleep' ? 'OPTIMIZED' : 'STANDARD'}</span>
                  </div>
               </div>

               <div className="space-y-2">
                  <div className="flex justify-between items-center text-[8px] mono-data uppercase">
                     <span className="text-zinc-500">Storage Bank</span>
                     <span className={data.energy.battery > 50 ? 'text-white' : 'text-red-400'}>{data.energy.battery}%</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                     <motion.div 
                       animate={{ width: `${data.energy.battery}%` }}
                       className={`h-full ${data.energy.battery > 50 ? 'bg-[var(--accent-gold)]' : 'bg-red-500'} shadow-[0_0_10px_rgba(250,204,21,0.3)]`}
                     />
                  </div>
               </div>
            </div>
          </div>

          <div className="glass-hud p-6">
            <span className="mono-data text-[10px] text-zinc-400 block mb-4 italic">Quick Actions</span>
            <div className="flex flex-col gap-2">
               {[
                 { id: 'Standard', icon: Shield },
                 { id: 'Sleep', icon: Moon },
                 { id: 'Duress', icon: AlertTriangle }
               ].map(mode => (
                 <button 
                  key={mode.id}
                  onClick={() => setMode(mode.id)}
                  className={`flex items-center gap-4 p-3 rounded-xl transition-all border ${data.mode === mode.id ? 'bg-[var(--accent-gold)]/10 border-[var(--accent-gold)] text-[var(--accent-gold)]' : 'bg-transparent border-white/5 text-zinc-500 hover:text-white'}`}
                 >
                   <mode.icon size={16} />
                   <span className="text-xs font-bold uppercase tracking-widest">{mode.id}</span>
                 </button>
               ))}
            </div>
          </div>

          <div className="glass-hud p-6">
             <div className="flex items-center gap-3 mb-4 text-[var(--accent-cyan)]">
                <Link size={14} />
                <span className="mono-data text-[10px] tracking-widest italic">HA Integration Matrix</span>
             </div>
             <div className="flex justify-between items-end">
                <div className="flex flex-col gap-1">
                   <span className="mono-data text-[10px] font-bold text-white tracking-widest">{haStatus?.connected ? 'CONNECTED' : 'OFFLINE'}</span>
                   <span className="mono-data text-[8px] text-zinc-500">SYNC_NODES: {haStatus?.syncedDevices || 0}</span>
                </div>
                <div className={`w-2 h-2 rounded-full ${haStatus?.connected ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-red-500'}`} />
             </div>
          </div>

          <div className="glass-hud p-6">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[var(--accent-gold)]">
                   <Settings size={14} />
                   <span className="mono-data text-[10px] uppercase font-bold tracking-widest">Audio Neural Link</span>
                </div>
                <div className="flex items-center gap-1.5">
                   <div className={`w-1.5 h-1.5 rounded-full ${isGlobalMuted ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
                   <span className="mono-data text-[7px] text-zinc-500">{isGlobalMuted ? 'OFF' : 'LIVE'}</span>
                </div>
             </div>
             
             <div className="space-y-4">
                <div className="flex flex-col gap-2">
                   <span className="mono-data text-[8px] text-zinc-500">Acoustic Archetype</span>
                   <div className="grid grid-cols-3 gap-1">
                      {['deep_space', 'nebula', 'pulse'].map(t => (
                        <button 
                          key={t}
                          onClick={() => setAudioTheme(t as any)}
                          className={`p-2 rounded-lg text-[7px] border font-black uppercase transition-all ${audioTheme === t ? 'bg-[var(--accent-gold)]/10 border-[var(--accent-gold)] text-[var(--accent-gold)]' : 'bg-black/20 border-white/5 text-zinc-600'}`}
                        >
                           {t.split('_')[0]}
                        </button>
                      ))}
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <div className="flex justify-between items-center">
                      <span className="mono-data text-[8px] text-zinc-500">Volume Intensity</span>
                      <span className="mono-data text-[8px] text-white">0.015</span>
                   </div>
                   <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden relative">
                      <div className="absolute inset-0 bg-[var(--accent-gold)]/20 w-[1.5%]" />
                   </div>
                </div>
             </div>
          </div>

          <div className="glass-hud p-6">
             <div className="flex items-center gap-2 mb-4">
                <Sparkles size={14} className="text-[var(--accent-gold)]" />
                <span className="mono-data text-[10px] text-zinc-400">Contextual Insight</span>
             </div>
             <motion.div 
               animate={{ opacity: [0.5, 1, 0.5] }}
               transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
               className="p-4 bg-[var(--accent-gold)]/5 border border-[var(--accent-gold)]/10 rounded-xl"
             >
                <p className="mono-data text-[9px] text-[var(--accent-gold)] leading-relaxed italic tracking-wider">
                   {aiSuggestion}
                </p>
             </motion.div>
          </div>

          <div className="glass-hud p-6">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[var(--accent-gold)]">
                   <Cpu size={14} />
                   <span className="mono-data text-[10px] tracking-widest italic uppercase">Ecosystem Core</span>
                </div>
                <span className={`mono-data text-[8px] px-2 py-0.5 rounded-full border ${isLocalConnection ? 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10' : 'text-zinc-500 border-zinc-700 bg-zinc-900'}`}>
                   {isLocalConnection ? 'DIRECT_P2P' : 'CLOUD_RELAY'}
                </span>
             </div>
             <div className="flex flex-col gap-3">
                <button 
                  onClick={findMyPhone}
                  disabled={isFindingPhone}
                  className="w-full flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group"
                >
                   <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-lg bg-[var(--accent-gold)]/10 flex items-center justify-center">
                            {isFindingPhone ? <RefreshCw className="text-[var(--accent-gold)] animate-spin" size={14} /> : <Scan className="text-[var(--accent-gold)]" size={14} />}
                         </div>
                         <span className="text-[10px] text-zinc-300 font-bold tracking-tight">Find My Phone</span>
                      </div>
                      <ChevronRight size={14} className="text-zinc-600 group-hover:translate-x-1 transition-transform" />
                   </div>
                   
                   {phoneTrackingResult && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-black/40 rounded-lg p-2 mt-1 border border-white/5"
                      >
                         <div className="flex items-center gap-2 mb-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${phoneTrackingResult.status === 'ONLINE' ? 'bg-cyan-400' : 'bg-red-400'}`} />
                            <span className="mono-data text-[7px] text-white tracking-widest">{phoneTrackingResult.status}</span>
                         </div>
                         <p className="text-[8px] text-zinc-400 leading-tight">{phoneTrackingResult.message || `Located in ${phoneTrackingResult.room}`}</p>
                         {phoneTrackingResult.lastBattery && (
                           <div className="mt-1 flex items-center gap-2">
                              <Battery size={8} className="text-red-400" />
                              <span className="mono-data text-[7px] text-red-400">{phoneTrackingResult.lastBattery}% at {phoneTrackingResult.timestamp}</span>
                           </div>
                         )}
                      </motion.div>
                   )}
                </button>
                
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                   <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${isSaaSTier ? 'bg-cyan-400/10' : 'bg-zinc-800'} flex items-center justify-center`}>
                         <Shield className={isSaaSTier ? 'text-cyan-400' : 'text-zinc-500'} size={14} />
                      </div>
                      <div className="flex flex-col">
                         <span className="text-[10px] text-zinc-300 font-bold tracking-tight">SaaS Tier</span>
                         <span className="mono-data text-[7px] text-zinc-500">{isSaaSTier ? 'PREMIUM_ACTIVE' : 'OFFLINE_FREE'}</span>
                      </div>
                   </div>
                   <button 
                     onClick={toggleSaaSTier}
                     disabled
                     title="Subscription status is controlled by signed cloud entitlements."
                     className={`w-10 h-5 opacity-50 cursor-not-allowed rounded-full relative transition-all ${isSaaSTier ? 'bg-cyan-500' : 'bg-zinc-700'}`}
                   >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isSaaSTier ? 'right-1' : 'left-1'}`} />
                   </button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                   <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${isPhonePresent ? 'bg-green-400/10' : 'bg-red-400/10'} flex items-center justify-center`}>
                         <Smartphone className={isPhonePresent ? 'text-green-400' : 'text-red-400'} size={14} />
                      </div>
                      <div className="flex flex-col">
                         <span className="text-[10px] text-zinc-300 font-bold tracking-tight">Phone Presence</span>
                         <span className="mono-data text-[7px] text-zinc-500">{isPhonePresent ? 'TRUSTED_LINK_UP' : 'DEVICE_DEAD/ABSENT'}</span>
                      </div>
                   </div>
                   <button 
                     onClick={() => setIsPhonePresent(!isPhonePresent)}
                     className={`w-10 h-5 rounded-full relative transition-all ${isPhonePresent ? 'bg-green-500' : 'bg-zinc-700'}`}
                   >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isPhonePresent ? 'right-1' : 'left-1'}`} />
                   </button>
                </div>

                <button 
                  onClick={startOnboarding}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/20 hover:bg-[var(--accent-gold)]/20 transition-all text-[var(--accent-gold)]"
                >
                   <Settings size={14} />
                   <span className="text-[10px] font-bold tracking-tight uppercase">Run Onboarding Seq.</span>
                </button>
             </div>
          </div>

          <div className="glass-hud p-6">
            <span className="mono-data text-[10px] text-zinc-400 block mb-1">Quick Comms</span>
            <form onSubmit={sendVoiceCommand} className="relative">
               <input 
                 value={voiceInput}
                 onChange={e => setVoiceInput(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs focus:ring-1 focus:ring-[var(--accent-gold)] outline-none"
                 placeholder="Command..."
               />
               <button type="submit" className="absolute right-3 top-3 text-[var(--accent-gold)]">
                 <Send size={14} />
               </button>
            </form>
          </div>

        </div>

        {/* Center: Digital Twin & Controls */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
          <DigitalTwinView 
            alerts={data?.alerts || []} 
            spatialPulseMessage={spatialPulseMessage} 
            expandedDeviceId={expandedDeviceId}
            setExpandedDeviceId={setExpandedDeviceId}
          />
          
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
             {data.devices.map(dev => (
               <DeviceHUDCard 
                 key={dev.id} 
                 device={dev} 
                 onToggle={() => toggleDevice(dev.id, dev.state)} 
                 isExpanded={expandedDeviceId === dev.id}
                 onExpand={() => setExpandedDeviceId(expandedDeviceId === dev.id ? null : dev.id)}
               />
             ))}
          </div>

          <TelemetryStrip history={voltageHistory} energy={data.energy} />
        </div>

        {/* Right: Trust Console & Analytics */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
           
           {/* The Trust Terminal */}
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
                      <span className="opacity-40 text-[9px] mr-2">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
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
                 <button onClick={syncHA} className="p-2 text-zinc-500 hover:text-white">
                   <RefreshCw size={12} />
                 </button>
              </div>
           </div>

           <div className="glass-hud p-6 bg-gradient-to-br from-[var(--accent-gold)]/5 to-transparent">
              <span className="mono-data text-[10px] text-zinc-400 block mb-4 uppercase">Load Shedding Impact</span>
              <span className="block text-3xl font-black italic text-[var(--accent-gold)]">142.8 kWh</span>
              <span className="text-[9px] mono-data text-zinc-500 tracking-tighter mt-1 block">Cumulative offset since activation</span>
           </div>
        </div>

      </div>

      <button 
        onClick={() => setShowVoiceOverlay(true)}
        className="fixed bottom-10 right-10 z-[80] w-16 h-16 rounded-full bg-[var(--accent-gold)] text-black flex items-center justify-center fab-glow hover:scale-110 transition-all pointer-events-auto"
      >
        <Mic size={28} />
      </button>

      <VoiceCommandOverlay 
        isOpen={showVoiceOverlay} 
        onClose={() => {
          setShowVoiceOverlay(false);
          setIsVoiceVerified(false);
        }}
        onSend={sendVoiceCommand}
        onRecord={toggleRecording}
        recording={recording}
        transcribing={transcribing}
        input={voiceInput}
        setInput={setVoiceInput}
        activeZone={activeZone}
        voiceConfidence={voiceConfidence}
        isVoiceVerified={isVoiceVerified}
      />

      {/* VAULT AUTH MODAL */}
      <AnimatePresence>
        {showVaultAuth && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="max-w-md w-full glass-hud p-8 border-t-2 border-red-500/50"
             >
                <div className="flex items-center gap-4 mb-6 text-red-500">
                   <ShieldAlert size={32} />
                   <div>
                      <h2 className="text-xl font-black uppercase tracking-tight text-white leading-none">Vault Security</h2>
                      <span className="mono-data text-[10px] tracking-[0.2em] opacity-60">PHONE_VERIFICATION_REQUIRED</span>
                   </div>
                </div>
                <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                   The requested action <span className="text-[var(--accent-gold)] font-mono">"{vaultAction}"</span> is identified as a high-security protocol. Please enter the SuperAdmin PIN to authorize via manual override.
                </p>
                <form onSubmit={handleVaultAuth} className="flex flex-col gap-4">
                   <input 
                     type="password"
                     autoFocus
                     placeholder="ENTER SECURE PIN"
                     value={vaultPin}
                     onChange={e => setVaultPin(e.target.value)}
                     className="w-full bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-center text-2xl tracking-[1em] text-white focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                   />
                   {vaultError && <p className="text-center text-red-500 mono-data text-[10px]">{vaultError}</p>}
                   <div className="grid grid-cols-2 gap-4">
                      <button 
                        type="button" 
                        onClick={() => setShowVaultAuth(false)}
                        className="p-4 rounded-xl border border-white/10 text-zinc-500 font-bold uppercase text-xs hover:bg-white/5 transition-all"
                      >
                         Cancel
                      </button>
                      <button 
                        type="submit"
                        className="p-4 rounded-xl bg-red-600 text-white font-black uppercase text-xs tracking-widest hover:bg-red-500 transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                      >
                         Authorize
                      </button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ONBOARDING MODAL */}
      <AnimatePresence>
        {showOnboarding && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl overflow-y-auto">
             <motion.div 
               initial={{ y: 20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               className="max-w-2xl w-full glass-hud p-10 border-t-2 border-[var(--accent-gold)]"
             >
                {onboardingStep === 'qr' && (
                  <div className="text-center">
                     <QrCode size={64} className="mx-auto mb-6 text-[var(--accent-gold)]" />
                     <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Establishing Link</h2>
                     <p className="text-zinc-500 mb-8 max-w-sm mx-auto">Scan the QR code on the Hub base to create a Zero-Knowledge P2P tunnel between your phone and Ujo OS.</p>
                     <div className="w-48 h-48 bg-white mx-auto p-4 rounded-3xl mb-8 flex items-center justify-center">
                        <QrCode size={120} className="text-black" />
                     </div>
                     <button 
                       onClick={() => completeStep('qr')}
                       className="px-10 py-4 bg-[var(--accent-gold)] text-black font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all"
                     >
                        Link Established
                     </button>
                  </div>
                )}

                {onboardingStep === 'voice' && (
                  <div className="text-center">
                     <Mic size={64} className="mx-auto mb-6 text-[var(--accent-gold)] animate-pulse" />
                     <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Voice Calibration</h2>
                     <p className="text-zinc-500 mb-8 max-w-sm mx-auto">Please read the following sentence aloud so the Hub can map your vocal tract signature.</p>
                     <div className="bg-white/5 border border-white/5 p-8 rounded-3xl mb-8 italic text-xl text-zinc-300 font-serif">
                        "Ujo, the sun is rising over the lagoon. Secure the perimeter and prepare for the day."
                     </div>
                     <button 
                       onClick={() => completeStep('voice')}
                       className="px-10 py-4 border-2 border-[var(--accent-gold)] text-[var(--accent-gold)] font-black uppercase tracking-widest rounded-2xl hover:bg-[var(--accent-gold)]/10 transition-all"
                     >
                        Confirm Biometrics
                     </button>
                  </div>
                )}

                {onboardingStep === 'complete' && (
                  <div className="text-center">
                     <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check size={40} className="text-green-500" />
                     </div>
                     <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">System Online</h2>
                     <p className="text-zinc-500 mb-8 max-w-sm mx-auto">Your identity is now anchored to this Hub. The ecosystem is fully calibrated and autonomous.</p>
                     <div className="inline-flex gap-4">
                        <span className="mono-data text-[10px] text-green-500 tracking-widest">ENCRYPTED_P2P_ACTIVE</span>
                        <span className="mono-data text-[10px] text-green-500 tracking-widest">ADMIN_VOICE_VERIFIED</span>
                     </div>
                  </div>
                )}
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {spatialPulseMessage && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.8 }} 
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] px-8 py-4 glass-hud bg-[var(--accent-gold)]/20 border-[var(--accent-gold)] text-[var(--accent-gold)] font-mono text-[10px] uppercase tracking-widest font-bold glow-gold"
          >
            {spatialPulseMessage}
          </motion.div>
        )}
        
        {nlpResponse && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 50 }} 
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] max-w-xl w-[90%] px-6 py-4 glass-hud border-t-2 border-[var(--accent-gold)] bg-black/80 backdrop-blur-md"
          >
             <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-gold)]/10 flex items-center justify-center shrink-0">
                   <Sparkles size={14} className="text-[var(--accent-gold)]" />
                </div>
                <p className="text-xs text-white font-medium leading-relaxed italic">
                   {nlpResponse}
                </p>
             </div>
             <motion.div 
               initial={{ width: "100%" }}
               animate={{ width: 0 }}
               transition={{ duration: 10, ease: "linear" }}
               className="h-0.5 bg-[var(--accent-gold)]/30 absolute bottom-0 left-0"
             />
          </motion.div>
        )}
      </AnimatePresence>

      {/* HITL Alerts Overlay */}
      <AnimatePresence>
        {data.alerts.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl grid place-items-center p-6 text-center">
            {data.alerts.map((alert) => (
              <motion.div key={alert.id} initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="max-w-lg w-full glass-hud border-t-8 border-t-[var(--alert-red)] p-10">
                <div className="flex flex-col items-center mb-8">
                  <div className="p-4 bg-red-500/10 rounded-full text-red-500 shadow-lg mb-6">
                    <AlertTriangle size={48} />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tight italic mb-2">{alert.title}</h3>
                  <p className="mono-data text-[10px] text-red-500 mb-6">Intervention Required</p>
                  <p className="text-zinc-200 text-lg leading-relaxed font-medium">"{alert.message}"</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => confirmAlert(alert.id, 'Ignore')} className="py-5 px-6 rounded-xl font-bold text-zinc-500 bg-white/5 hover:bg-white/10 transition-all uppercase text-[10px] tracking-widest">Decline</button>
                  <button onClick={() => confirmAlert(alert.id, 'Confirm')} className="py-5 px-6 rounded-xl font-black bg-[var(--alert-red)] text-white hover:scale-[1.02] transition-all uppercase text-[10px] tracking-widest flex items-center justify-center gap-3">
                    Confirm Action
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SETTINGS MODAL */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-6"
          >
             <motion.div 
               initial={{ scale: 0.9, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               className="w-full max-w-4xl max-h-[80vh] bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden flex flex-col"
             >
                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--accent-gold)]/10 flex items-center justify-center">
                         <Settings className="text-[var(--accent-gold)]" size={24} />
                      </div>
                      <div>
                         <h2 className="text-xl font-black italic text-white uppercase tracking-tight">System Configuration</h2>
                         <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Global Node Controller</p>
                      </div>
                   </div>
                   <button 
                     onClick={() => setShowSettings(false)}
                     className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all text-zinc-400"
                   >
                      <VolumeX size={18} />
                   </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-8 custom-scrollbar">
                   {/* AI Assistant Personality */}
                   <div className="space-y-6">
                      <div className="flex items-center gap-2 mb-2">
                         <Sparkles className="text-[var(--accent-gold)]" size={16} />
                         <span className="text-xs font-bold text-white uppercase tracking-widest">Assistant Customization</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2">
                         {['Ujo', 'Jarvis', 'Samantha'].map(p => (
                           <button 
                             key={p}
                             onClick={() => saveVoiceSettings({ ...voiceSettings, persona: p })}
                             className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${voiceSettings.persona === p ? 'bg-[var(--accent-gold)]/10 border-[var(--accent-gold)] text-[var(--accent-gold)]' : 'bg-white/5 border-white/5 text-zinc-500 hover:border-white/20'}`}
                           >
                              <Mic size={14} className={voiceSettings.persona === p ? 'animate-pulse' : ''} />
                              <span className="text-[9px] font-black tracking-widest">{p}</span>
                           </button>
                         ))}
                      </div>

                      <div className="space-y-4 bg-white/5 p-4 rounded-2xl">
                         <div className="space-y-2">
                            <div className="flex justify-between text-[8px] font-mono uppercase text-zinc-500">
                               <span>Vocal Pitch</span>
                               <span className="text-[var(--accent-gold)] font-bold">{voiceSettings.pitch.toFixed(1)}x</span>
                            </div>
                            <input 
                              type="range" min="0.5" max="2" step="0.1"
                              value={voiceSettings.pitch}
                              onChange={(e) => saveVoiceSettings({ ...voiceSettings, pitch: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-white/10 rounded-full appearance-none accent-[var(--accent-gold)] cursor-pointer"
                            />
                         </div>
                         <div className="space-y-2">
                            <div className="flex justify-between text-[8px] font-mono uppercase text-zinc-500">
                               <span>Speech Cadence</span>
                               <span className="text-[var(--accent-gold)] font-bold">{voiceSettings.speechRate.toFixed(1)}x</span>
                            </div>
                            <input 
                              type="range" min="0.5" max="2" step="0.1"
                              value={voiceSettings.speechRate}
                              onChange={(e) => saveVoiceSettings({ ...voiceSettings, speechRate: parseFloat(e.target.value) })}
                              className="w-full h-1 bg-white/10 rounded-full appearance-none accent-[var(--accent-gold)] cursor-pointer"
                            />
                         </div>
                      </div>

                      {/* Ambient Audio Controls */}
                      <div className="pt-6 border-t border-white/5 space-y-4">
                         <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                               <Wind size={14} className="text-[var(--accent-cyan)]" />
                               <span className="text-xs font-bold text-white uppercase tracking-widest">Ambient Field</span>
                            </div>
                            <button 
                               onClick={() => setIsGlobalMuted(!isGlobalMuted)}
                               className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${isGlobalMuted ? 'bg-red-500/20 text-red-500' : 'bg-green-500/10 text-green-500'}`}
                            >
                               {isGlobalMuted ? 'Muted' : 'Surround Active'}
                            </button>
                         </div>
                         <div className="flex gap-2">
                            {['deep_space', 'nebula', 'pulse'].map(t => (
                               <button 
                                 key={t}
                                 onClick={() => setAudioTheme(t as any)}
                                 className={`flex-1 py-3 rounded-xl border text-[8px] font-black uppercase tracking-tighter transition-all ${audioTheme === t ? 'bg-[var(--accent-cyan)]/10 border-[var(--accent-cyan)] text-[var(--accent-cyan)]' : 'bg-white/5 border-white/5 text-zinc-500'}`}
                               >
                                  {t.replace('_', ' ')}
                               </button>
                            ))}
                         </div>
                      </div>
                   </div>

                   {/* Guest Session Management */}
                   <div className="space-y-6">
                      <div className="flex items-center justify-between mb-2">
                         <div className="flex items-center gap-2">
                            <QrCode className="text-[var(--accent-cyan)]" size={16} />
                            <span className="text-xs font-bold text-white uppercase tracking-widest">Active Guest Tokens</span>
                         </div>
                         <button 
                           onClick={generateGuestQR}
                           className="text-[9px] font-black text-[var(--accent-cyan)] hover:underline uppercase tracking-tighter"
                         >
                           + Issue New Token
                         </button>
                                          <div className="space-y-3">
                         {guestSessions.length === 0 ? (
                           <div className="p-8 border border-dashed border-white/5 rounded-3xl flex flex-col items-center gap-4 text-center bg-black/20">
                              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                                 <Shield size={20} className="text-zinc-600" />
                              </div>
                              <p className="text-[10px] text-zinc-500 font-mono leading-relaxed px-4">Secure zone established. No active ephemeral identities detected in proximity.</p>
                           </div>
                         ) : (
                           guestSessions.map(session => (
                             <motion.div 
                               initial={{ opacity: 0, x: -10 }}
                               animate={{ opacity: 1, x: 0 }}
                               key={session.id} 
                               className="p-5 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:border-[var(--accent-cyan)]/30 hover:bg-white/[0.08] transition-all cursor-default"
                             >
                                <div className="flex items-center gap-4">
                                   <div className="w-12 h-12 rounded-2xl bg-[var(--accent-cyan)]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                      <Zap className="text-[var(--accent-cyan)]" size={18} />
                                   </div>
                                   <div className="flex flex-col">
                                      <span className="text-xs font-bold text-white tracking-tight mb-0.5">{session.name}</span>
                                      <div className="flex items-center gap-2">
                                         <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]" />
                                         <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">
                                           Expiry: {new Date(session.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                         </span>
                                      </div>
                                   </div>
                                </div>
                                <button 
                                  onClick={() => revokeGuestSession(session.id)}
                                  className="px-4 py-2 rounded-xl bg-red-500/10 text-red-500 text-[8px] font-black uppercase lg:opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                                >
                                   Revoke Access
                                </button>
                             </motion.div>
                           ))
                         )}
                      </div>     </div>
                   </div>
                </div>

                <div className="p-8 border-t border-white/5 bg-black/20 flex justify-between items-center">
                   <div className="flex items-center gap-4">
                      <div className="flex flex-col">
                         <span className="text-[10px] font-bold text-white">Kernel Stability</span>
                         <div className="flex gap-1 items-center">
                            <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity }} className="w-1 h-1 rounded-full bg-green-500" />
                            <span className="text-[8px] font-mono text-zinc-500">99.98% - NOMINAL</span>
                         </div>
                      </div>
                   </div>
                   <button 
                     onClick={() => setShowSettings(false)}
                     className="px-8 py-3 bg-[var(--accent-gold)] text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-95 transition-transform"
                   >
                      Commit Changes
                   </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
