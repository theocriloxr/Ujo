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
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- TYPES ---
interface Device {
  id: string;
  name: string;
  type: string;
  state: string;
  status: string;
  power_usage: number;
}

interface EnergyData {
  grid: string;
  voltage: number;
  status: string;
  battery: number;
  solar: number;
  forecast: string;
}

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: string;
  timestamp: string;
  type: 'anomaly' | 'vendor' | 'energy' | 'health';
}

interface SystemData {
  devices: Device[];
  mode: string;
  location: string;
  alerts: Alert[];
  energy: EnergyData;
}

interface HAStatus {
  connected: boolean;
  hub: string;
  version: string;
  syncedDevices: number;
}

// --- COMPONENTS ---

interface DeviceCardProps {
  device: Device;
  onToggle: () => void | Promise<void>;
  key?: string | number;
}

const DeviceCard = ({ device, onToggle }: DeviceCardProps) => {
  const getIcon = () => {
    switch (device.type) {
      case 'light': return <Lightbulb className={device.state === 'on' ? 'text-[var(--accent)]' : 'text-zinc-500'} />;
      case 'lock': return <Lock className={device.state === 'locked' ? 'text-[var(--accent)]' : 'text-zinc-500'} />;
      case 'climate': return <Thermometer className="text-zinc-400" />;
      case 'appliance': return <Zap className={device.state === 'normal' ? 'text-zinc-400' : 'text-red-500'} />;
      case 'sensor': return <Activity className="text-zinc-400" />;
      default: return <Settings />;
    }
  };

  return (
    <motion.div 
      layout
      className="bento-card justify-between h-44 group cursor-pointer hover:border-zinc-500 transition-all shadow-sm"
      onClick={onToggle}
      id={`device-${device.id}`}
    >
      <div className="flex justify-between items-start">
        <div className="p-3 bg-zinc-800/80 rounded-2xl group-hover:bg-[var(--accent-muted)] transition-colors">
          {getIcon()}
        </div>
        <div className={`indicator ${device.status === 'online' ? 'active' : ''}`} />
      </div>
      <div>
        <h3 className="font-semibold text-sm text-zinc-100">{device.name}</h3>
        <p className="text-[10px] font-mono tech-text-dim uppercase tracking-wider mt-1">
          {device.state} {device.power_usage > 0 ? `• ${device.power_usage}W` : ''}
        </p>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [data, setData] = useState<SystemData | null>(null);
  const [haStatus, setHaStatus] = useState<HAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceInput, setVoiceInput] = useState('');
  const [nlpResponse, setNlpResponse] = useState<string | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState(0);

  const speakResponse = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 0.8;
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const startTraining = () => {
    setIsTraining(true);
    setTrainingStep(1);
    speakResponse("System wake word training initiated. Please say Jarvis three times.");
  };

  const nextTrainingStep = () => {
    if (trainingStep < 3) {
      setTrainingStep(prev => prev + 1);
    } else {
      setIsTraining(false);
      setTrainingStep(0);
      speakResponse("Biometric voice profile verified. Jarvis is now listening.");
    }
  };

  const fetchStates = async () => {
    try {
      const fetchWithLog = async (url: string) => {
        try {
          const res = await fetch(url);
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
      setData(jsonStates);
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
    const interval = setInterval(fetchStates, 2000);
    return () => clearInterval(interval);
  }, []);

  const toggleDevice = async (id: string, currentState: string) => {
    let nextState = '';
    if (id.startsWith('light')) nextState = currentState === 'on' ? 'off' : 'on';
    else if (id.startsWith('lock')) nextState = currentState === 'locked' ? 'unlocked' : 'locked';
    else return;

    try {
      await fetch('/api/device/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, state: nextState })
      });
      fetchStates();
    } catch (err) {
      console.error('Toggle failed', err);
    }
  };

  const setMode = async (mode: string) => {
    try {
      await fetch('/api/mode', {
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
      await fetch('/api/hitl/confirm', {
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
    await fetch('/api/anomaly', { method: 'POST' });
  };

  const sendVoiceCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceInput.trim()) return;

    try {
      const res = await fetch('/api/nlp-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: voiceInput })
      });
      const result = await res.json();
      setNlpResponse(result.response);
      speakResponse(result.response);
      setVoiceInput('');
      fetchStates();
      setTimeout(() => setNlpResponse(null), 8000);
    } catch (err) {
      console.error('NLP Parse failed', err);
    }
  };

  const toggleLocation = async () => {
    const nextLoc = data?.location === 'Home' ? 'Away' : 'Home';
    await fetch('/api/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: nextLoc })
    });
    fetchStates();
  };

  const simulateMotion = async () => {
    await fetch('/api/motion', { method: 'POST' });
    fetchStates();
  };

  const syncHA = async () => {
    await fetch('/api/ha/sync', { method: 'POST' });
    fetchStates();
  };

  const simulateStaffAccess = async () => {
    await fetch('/api/access/staff-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'staff_1' })
    });
    fetchStates();
  };

  const simulateHealthAlert = async () => {
    await fetch('/api/health/co2-trigger', { method: 'POST' });
    fetchStates();
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-4">
          <Cpu className="animate-pulse text-[var(--accent)]" size={48} />
          <p className="font-mono text-xs tech-text-dim tracking-[0.2em] uppercase italic">Initializing Ujo OS JARVIS Core...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col md:flex-row p-6 md:p-8 gap-8 overflow-hidden selection:bg-[var(--accent)] selection:text-black">
      {/* Dynamic Sidebar / Quick HUD */}
      <aside className="w-full lg:w-80 flex flex-col gap-6">
        <div className="bento-card bg-zinc-900 border-none shadow-none flex-row items-center gap-4 py-4 rounded-full">
          <div className="w-12 h-12 bg-[var(--accent)] rounded-full grid place-items-center text-black">
            <Activity size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight italic">Ujo JARVIS</h1>
            <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest leading-none">V2.0 ALPHA</p>
          </div>
        </div>

        {/* Operational Modes */}
        <div className="bento-card">
          <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest mb-4">Logical States</p>
          <div className="flex flex-col gap-2">
            {[
              { id: 'Standard', icon: Shield },
              { id: 'Sleep', icon: Moon },
              { id: 'Manual Override', icon: Power }
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setMode(mode.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                  data.mode === mode.id 
                    ? 'bg-[var(--accent)] text-black' 
                    : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
                }`}
              >
                <mode.icon size={18} />
                {mode.id}
              </button>
            ))}
          </div>
        </div>

        {/* Energy HUD */}
        <div className="bento-card bg-gradient-to-br from-zinc-900 to-black">
          <div className="flex justify-between items-center mb-4">
            <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest">Energy Pulse</p>
            <Zap size={14} className="tech-accent" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-zinc-800/40 rounded-2xl">
              <span className="block text-xl font-bold italic">{data.energy.battery}%</span>
              <span className="text-[9px] tech-text-dim uppercase font-mono">Inverter</span>
            </div>
            <div className="text-center p-3 bg-zinc-800/40 rounded-2xl">
              <span className="block text-xl font-bold italic">{data.energy.solar}kW</span>
              <span className="text-[9px] tech-accent uppercase font-mono">Solar Gen</span>
            </div>
          </div>
          
          {/* Energy Armor */}
          <div className="mt-4 p-4 bg-lime-500/5 border border-lime-500/20 rounded-2xl">
             <div className="flex justify-between items-center mb-1">
                <span className="text-[9px] font-mono tech-accent uppercase">Grid Armor Active</span>
                <Shield size={10} className="tech-accent" />
             </div>
             <div className="flex justify-between items-end">
                <span className="text-lg font-black italic">{data.energy.voltage}V</span>
                <span className="text-[8px] font-mono text-lime-500 uppercase">{data.energy.status}</span>
             </div>
          </div>

          <div className="mt-4 p-3 border border-zinc-500/10 rounded-2xl bg-black/20">
            <p className="text-[9px] italic leading-tight text-zinc-500">
              "{data.energy.forecast}. Solar harvest restricted."
            </p>
          </div>
        </div>

        {/* HA Link HUD */}
        <div className="bento-card">
          <div className="flex justify-between items-center mb-4">
            <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest">Bridge Matrix</p>
            <Link size={14} className={haStatus?.connected ? 'tech-accent' : 'text-zinc-600'} />
          </div>
          <div className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-2xl border tech-border">
             <div className={`indicator ${haStatus?.connected ? 'active' : ''}`} />
             <div className="flex-1">
               <span className="block text-xs font-bold uppercase">{haStatus?.hub}</span>
               <span className="text-[9px] tech-text-dim uppercase font-mono">{haStatus?.syncedDevices} Entities Linked</span>
             </div>
             <button onClick={syncHA} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500">
               <RefreshCw size={14} />
             </button>
          </div>
        </div>
      </aside>

      {/* Main Grid View */}
      <main className="flex-1 overflow-y-auto no-scrollbar pb-10">
        <div className="bento-grid">
          {/* JARVIS INPUT - SPAN 24 */}
          <div className="grid-col-24 bento-card bg-zinc-900/50 border-2 border-[var(--accent-muted)] shadow-inner">
             <div className="flex items-center gap-4 mb-4">
               <Activity size={18} className="tech-accent animate-pulse" />
               <h2 className="text-sm font-bold uppercase tracking-[0.2em] italic">Omni-Channel Voice Engine (Offline STT)</h2>
             </div>
             <form onSubmit={sendVoiceCommand} className="flex gap-4">
                <input 
                  type="text"
                  value={voiceInput}
                  onChange={(e) => setVoiceInput(e.target.value)}
                  placeholder="Ask Jarvis anything..."
                  className="flex-1 bg-black/40 border-none rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-[var(--accent)] transition-all"
                />
                <button type="submit" className="p-4 bg-[var(--accent)] text-black rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-lime-500/10">Parse Intent</button>
             </form>
             <AnimatePresence>
                {nlpResponse && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 pt-4 border-t tech-border text-[13px] font-mono tech-accent leading-relaxed italic">
                    {nlpResponse}
                  </motion.div>
                )}
             </AnimatePresence>
          </div>

          {/* Context Sensors - SPAN 8 */}
          <div className="grid-col-8 grid-row-2 bento-card bg-gradient-to-b from-zinc-900 to-transparent">
             <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest mb-6">Environmental Awareness</p>
             <div className="flex flex-col gap-4">
                <div onClick={toggleLocation} className="flex items-center justify-between p-4 bg-zinc-800/40 rounded-3xl cursor-pointer hover:bg-zinc-800">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-900 rounded-2xl"><MapPin size={20} className={data.location === 'Home' ? 'tech-accent' : 'text-amber-500'} /></div>
                    <div className="text-left">
                      <p className="text-sm font-bold">{data.location}</p>
                      <p className="text-[9px] tech-text-dim uppercase font-mono">Mobile Geofence</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="tech-text-dim" />
                </div>
                
                <div onClick={simulateMotion} className="flex items-center justify-between p-4 bg-zinc-800/40 rounded-3xl cursor-pointer hover:bg-zinc-800">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-900 rounded-2xl"><Eye size={20} className="text-blue-400" /></div>
                    <div className="text-left">
                      <p className="text-sm font-bold">Motion Scan</p>
                      <p className="text-[9px] tech-text-dim uppercase font-mono">mmWave Sensing</p>
                    </div>
                  </div>
                  <div className="indicator active" />
                </div>

                <div onClick={simulateHealthAlert} className="flex items-center justify-between p-4 bg-zinc-800/40 rounded-3xl cursor-pointer hover:bg-zinc-800">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-zinc-900 rounded-2xl"><Activity size={20} className="text-emerald-400" /></div>
                    <div className="text-left">
                      <p className="text-sm font-bold">940 PPM</p>
                      <p className="text-[9px] tech-text-dim uppercase font-mono">CO2 Health Scan</p>
                    </div>
                  </div>
                  <div className="indicator active" />
                </div>
             </div>
          </div>

          {/* Device Matrix - SPAN 16 */}
          <div className="grid-col-16 bento-card border-none bg-transparent p-0">
             <div className="grid grid-cols-2 lg:grid-cols-2 gap-6 h-full">
                {data.devices.map(dev => (
                  <DeviceCard key={dev.id} device={dev} onToggle={() => toggleDevice(dev.id, dev.state)} />
                ))}
             </div>
          </div>

          {/* Security Profiles - SPAN 12 */}
          <div className="grid-col-12 bento-card">
              <div className="flex justify-between items-center mb-6">
                <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest">Staff Access Matrix</p>
                <Lock size={14} className="tech-text-dim" />
              </div>
              <div className="flex flex-col gap-3">
                 <div className="flex items-center justify-between p-4 bg-zinc-800/30 rounded-3xl border tech-border">
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-zinc-700/50 rounded-full grid place-items-center font-bold">A</div>
                       <div>
                          <p className="text-xs font-bold italic">Abike (Cleaner)</p>
                          <p className="text-[9px] tech-text-dim font-mono uppercase">Tuesdays • 10:00 - 14:00</p>
                       </div>
                    </div>
                    <button onClick={simulateStaffAccess} className="px-3 py-1 bg-zinc-800 rounded-full text-[9px] font-bold uppercase tech-accent">Simulate Tap</button>
                 </div>
              </div>
          </div>

          {/* Debug Console - SPAN 12 */}
          <div className="grid-col-12 bento-card bg-zinc-900/20 border-dashed border-zinc-800">
             <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest mb-4 italic">Protocol Overrides</p>
             <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                <button onClick={triggerAnomaly} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-red-500 text-zinc-500 hover:text-red-500 transition-colors">FORCE_ANOMALY</button>
                <button onClick={startTraining} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-[var(--accent)] text-zinc-500 hover:text-[var(--accent)] transition-colors">TRAIN_VOICE_MODEL</button>
                <button className="px-3 py-1 border border-zinc-800 rounded-lg text-zinc-500">SIM_POWER_FAILURE</button>
             </div>
          </div>
        </div>
      </main>

      {/* Voice Training Overlay */}
      <AnimatePresence>
        {isTraining && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-2xl grid place-items-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="max-w-md w-full bento-card text-center items-center py-12">
               <div className="w-24 h-24 bg-[var(--accent)] rounded-full grid place-items-center mb-8 shadow-2xl shadow-lime-500/20">
                  <Mic size={40} className="text-black animate-pulse" />
               </div>
               <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-2">Voice Training</h3>
               <p className="text-zinc-500 text-sm mb-8 font-mono uppercase tracking-widest">Step {trainingStep} of 3 • Local Profile Creation</p>
               
               <p className="text-xl font-medium text-white mb-10 leading-relaxed italic">
                 "Say: Jarvis, I am home."
               </p>

               <button onClick={nextTrainingStep} className="w-full py-5 bg-[var(--accent)] text-black font-black uppercase tracking-widest rounded-[2rem] hover:scale-[1.02] transition-all">
                 Record Sample
               </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HITL Alerts Overlay - REFINED */}
      <AnimatePresence>
        {data.alerts.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl grid place-items-center p-6">
            {data.alerts.map((alert) => (
              <motion.div key={alert.id} initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="max-w-lg w-full bento-card border-t-8 border-t-[var(--alert-red)] shadow-2xl shadow-red-500/20 bg-zinc-900">
                <div className="flex items-start gap-6 mb-8">
                  <div className="p-4 bg-red-500/10 rounded-[2rem] text-red-500 shadow-lg">
                    {alert.type === 'vendor' ? <RefreshCw size={40} className="animate-spin-slow" /> : <AlertTriangle size={40} />}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-black uppercase tracking-tight italic mb-2">{alert.title}</h3>
                    <p className="text-[10px] font-mono text-red-500 uppercase tracking-[0.3em] font-bold mb-4">Intervention Type: {alert.type}</p>
                    <p className="text-zinc-200 text-lg leading-relaxed font-medium">"{alert.message}"</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => confirmAlert(alert.id, 'Ignore')} className="py-5 px-6 rounded-[2rem] font-bold text-zinc-500 bg-zinc-800/50 hover:bg-zinc-800 transition-all uppercase text-[10px] tracking-widest">Decline Logic</button>
                  <button onClick={() => confirmAlert(alert.id, 'Confirm')} className="py-5 px-6 rounded-[2rem] font-black bg-[var(--alert-red)] text-white hover:scale-[1.02] transition-all uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-red-500/20">
                    Confirm Action <ChevronRight size={18} />
                  </button>
                </div>
                
                <div className="mt-8 pt-6 border-t border-zinc-800 flex justify-between items-center text-[9px] font-mono text-zinc-500 italic">
                  <span className="flex items-center gap-2"><Send size={10} /> Localized Decision Gate</span>
                  <span>ID: {alert.id}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
