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
  Scan
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { io } from 'socket.io-client';
import { GoogleGenAI, Type, Modality, FunctionDeclaration } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
}

interface EnergyData {
  grid: string;
  voltage: number;
  status: string;
  battery: number;
  solar: number;
  forecast: string;
}

interface DeviceCardProps {
  device: Device;
  onToggle: () => void;
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
}

interface HAStatus {
  connected: boolean;
  hub: string;
  version: string;
  syncedDevices: number;
}

// --- HUD COMPONENTS ---

const AIOrb = ({ active }: { active: boolean }) => (
  <div className="relative w-32 h-32 flex items-center justify-center">
    <div className={`absolute inset-0 rounded-full bg-[var(--accent-gold)] opacity-10 blur-2xl transition-all duration-1000 ${active ? 'scale-150 opacity-20' : 'scale-100'}`} />
    <motion.div 
      animate={{ 
        scale: active ? [1, 1.1, 1] : 1,
        boxShadow: active 
          ? ["0 0 20px rgba(250,204,21,0.2)", "0 0 60px rgba(250,204,21,0.5)", "0 0 20px rgba(250,204,21,0.2)"]
          : "0 0 20px rgba(250,204,21,0.1)"
      }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-600 to-yellow-200 border border-white/20 relative z-10 animate-orb"
    >
      <div className="absolute inset-2 rounded-full bg-black/40 backdrop-blur-sm shadow-inner" />
    </motion.div>
  </div>
);

const DigitalTwinMockup = () => (
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

const TelemetryStrip = ({ data }: { data: any[] }) => (
  <div className="glass-hud p-6 h-32 flex flex-col justify-between">
    <div className="flex justify-between items-center mb-2">
      <span className="mono-data text-[10px] text-zinc-400">Live Power Consumption Grid</span>
      <span className="mono-data text-[10px] text-[var(--accent-cyan)] font-bold">228.4V NOMINAL</span>
    </div>
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line 
            type="monotone" 
            dataKey="voltage" 
            stroke="var(--accent-cyan)" 
            strokeWidth={1.5} 
            dot={false} 
            isAnimationActive={false} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const DeviceHUDCard = ({ device, onToggle }: DeviceCardProps) => {
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

  return (
    <motion.div 
      onClick={onToggle}
      className={`glass-hud p-4 flex items-center justify-between group cursor-pointer ${isActive ? 'border-[var(--accent-gold)]/40 shadow-[0_0_20px_rgba(250,204,21,0.05)]' : ''}`}
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg border transition-all ${isActive ? 'bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/20' : 'bg-white/5 border-white/5'}`}>
          {getIcon()}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight text-white">{device.name}</span>
          <span className="mono-data text-[9px] text-zinc-500">{device.state}</span>
        </div>
      </div>
      <div className={`w-1 h-8 rounded-full transition-all ${isActive ? 'bg-[var(--accent-gold)]' : 'bg-zinc-800'}`} />
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
  const [activeZone, setActiveZone] = useState('Living Room');
  const [activeUser, setActiveUser] = useState('Owner');
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<'intro' | 'scanning' | 'complete'>('intro');
  const [scannedDevices, setScannedDevices] = useState<string[]>([]);
  const [spatialPulseMessage, setSpatialPulseMessage] = useState<string | null>(null);
  const [trustLogs, setTrustLogs] = useState<{ id: string, message: string, timestamp: string, type: string }[]>([]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const speakResponse = async (text: string) => {
    try {
      // 1. Try Cloud Native AI Voice for Natural Conversation 
      const persona = data?.voice?.persona;
      const voiceName = (persona?.toLowerCase() === 'onyx' || persona?.toLowerCase() === 'jarvis') ? 'Puck' : 'Kore'; 
      
      const ttsResp = await ai.models.generateContent({
         model: "gemini-3.1-flash-tts-preview",
         contents: [{ parts: [{ text: text }] }],
         config: {
           responseModalities: [Modality.AUDIO],
           speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName } }
           }
         }
      });
      
      const base64Audio = ttsResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
         const binaryString = atob(base64Audio);
         const bytes = new Uint8Array(binaryString.length);
         for (let i = 0; i < binaryString.length; i++) {
             bytes[i] = binaryString.charCodeAt(i);
         }
         
         const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
         const audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 24000);
         const channelData = audioBuffer.getChannelData(0);
         const dataView = new DataView(bytes.buffer);
         
         for (let i = 0; i < bytes.length / 2; i++) {
           channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
         }
         
         const source = audioContext.createBufferSource();
         source.buffer = audioBuffer;
         source.playbackRate.value = data?.voice?.rate || 1.05;
         source.connect(audioContext.destination);
         source.start();
         
         return;
      }
    } catch (e) {
      console.warn("Cloud TTS failed, falling back to offline browser TTS:", e);
    }
    
    // 2. Offline Fallback (Browser built-in TTS)
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferredVoices = voices.filter(v => 
        v.name.includes('Google UK English') || 
        v.name.includes('Samantha') || 
        v.name.includes('Microsoft') ||
        v.name.includes('Natural') ||
        v.name.includes('Siri')
      );
      if (preferredVoices.length > 0) {
        utterance.voice = preferredVoices[0];
      }
    }

    // Applying data-driven voice settings
    if (data?.voice) {
      utterance.pitch = data.voice.pitch;
      utterance.rate = data.voice.rate;
    } else {
      utterance.pitch = 0.85;
      utterance.rate = 0.95;
    }
    
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const isFirstRun = !localStorage.getItem('ujo_setup_complete');
    if (isFirstRun) {
      setShowOnboarding(true);
    }
  }, []);

  const handleStartSetup = () => {
    const greeting = getGreeting();
    const intro = `${greeting}. My name is Ujo, and I am your personal smart home assistant. I have been designed to keep your home secure, efficient, and proactive. I monitor your energy usage, protect your appliances from power surges, and manage access for your visitors. My intelligence is fully localized, meaning your data never leaves these walls. Let us begin by verifying my connection to your installed devices.`;
    speakResponse(intro);
    setOnboardingStep('scanning');
  };

  useEffect(() => {
    if (onboardingStep === 'scanning' && data?.devices) {
      const devicesToScan = data.devices;
      let index = 0;
      const interval = setInterval(() => {
        if (index < devicesToScan.length) {
          const device = devicesToScan[index];
          if (device && device.id) {
            setScannedDevices(prev => Array.from(new Set([...prev, device.id])));
          }
          index++;
        } else {
          clearInterval(interval);
          setTimeout(() => {
            setOnboardingStep('complete');
            speakResponse("All systems verified. Your home is now under my protection.");
            localStorage.setItem('ujo_setup_complete', 'true');
          }, 1000);
        }
      }, 800);
      return () => clearInterval(interval);
    }
  }, [onboardingStep]); // remove data from dependencies to avoid restarting interval on every real-time update

  const startTraining = () => {
    setIsTraining(true);
    setTrainingStep(1);
    speakResponse(`Voice biometrics enrollment initialized. Please read the three displayed sentences to extract your vocal MFCC signature.`);
  };

  const nextTrainingStep = () => {
    if (trainingStep < 3) {
      setTrainingStep(prev => prev + 1);
    } else {
      setIsTraining(false);
      setTrainingStep(0);
      speakResponse("Biometric voice print captured and hashed. Welcome to the household.");
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
        const newHistory = [...prev, { time: new Date().toLocaleTimeString(), voltage: jsonStates.energy.voltage }];
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
    const socket = io();
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
        const newHistory = [...prev, { time: new Date().toLocaleTimeString(), voltage: jsonStates.energy.voltage }];
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

    // Fallback polling for HA
    const interval = setInterval(() => {
      fetch('/api/ha/status')
        .then(res => res.json())
        .then(jsonHa => setHaStatus(jsonHa))
        .catch(() => {});
    }, 5000);

    return () => {
      clearInterval(interval);
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
      const res = await fetch('/api/security/unlock', {
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
    let nextState = '';
    
    // Security Gate for Lock
    if (id.startsWith('lock') && currentState === 'locked') {
      setShowKeypad(true);
      setLockedActionID(id);
      return;
    }

    if (id.startsWith('light')) nextState = currentState === 'on' ? 'off' : 'on';
    else if (id.startsWith('lock')) nextState = currentState === 'locked' ? 'unlocked' : 'locked';
    else if (id.startsWith('ac')) nextState = currentState === 'on' ? 'off' : 'on';
    else if (id.startsWith('pump')) nextState = currentState === 'on' ? 'off' : 'on';
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

    const controlDeviceFunctionDeclaration: FunctionDeclaration = {
      name: "controlDevice",
      parameters: {
        type: Type.OBJECT,
        description: "Toggle a smart home device or change its state.",
        properties: {
          deviceId: {
            type: Type.STRING,
            description: "The ID of the device to control (must be exact ID like 'light_living', 'ac_bedroom')."
          },
          action: {
            type: Type.STRING,
            description: "The desired action: 'on', 'off', 'locked', 'unlocked'."
          }
        },
        required: ["deviceId", "action"]
      }
    };

    const changeNameFunctionDeclaration: FunctionDeclaration = {
      name: "changeAssistantName",
      parameters: {
        type: Type.OBJECT,
        description: "Change the assistant's name (wake word) if the user asks.",
        properties: {
          newName: {
            type: Type.STRING,
            description: "The new name the user wants to call you."
          }
        },
        required: ["newName"]
      }
    };

    const devicesStr = data?.devices.map(d => `${d.name} (ID: ${d.id}, State: ${d.state})`).join(', ');

    const contextSettings = `You are ${data?.assistantName || 'Ujo'}, the sentient smart home assistant. The current user speaking is ${activeUser}. \
They are located in the ${activeZone}. \
Current available devices: ${devicesStr}. \
Grid power source: ${data?.powerSource}. Inverter Battery: ${data?.energy.battery}%. \
You must provide conversational, human-like responses. \
CRITICAL ROLE PERMISSIONS: If the activeUser is 'Guest', you must explicitly deny them access to unlocking devices or making purchases/dispatching. Only 'Owner' or 'Co-Admin' can do that. \
If the user asks you to control a device, use the controlDevice tool with the exact deviceId (unless denied by role). \
If the user asks to change your name, use the changeAssistantName tool (Owner/Co-Admin only). \
If the user says "I'm here" or asks to re-anchor audio, confirm that the Spatial Re-anchoring Protocol is active, overriding mmWave/cameras, and audio is localized to ${activeZone}. \
If they ask a general knowledge question (e.g. sports, weather, exchanges), use the googleSearch tool to find the exact latest info. \
If they speak contextually (e.g. "turn on the light here"), infer the device from their activeZone (${activeZone}).`;

    try {
      setNlpResponse('Processing...');
      
      const newHistory = [...chatHistory, `User ${activeUser} located in ${activeZone} says: ${voiceInput}`];
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [contextSettings, ...newHistory],
        config: {
          tools: [
            { googleSearch: {} },
            { functionDeclarations: [controlDeviceFunctionDeclaration, changeNameFunctionDeclaration] }
          ],
          toolConfig: { includeServerSideToolInvocations: true },
        }
      });

      let replyText = response.text || '';
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          if (call.name === 'controlDevice') {
            const { deviceId, action } = call.args as any;
            await fetch('/api/device/toggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: deviceId, state: action })
            });
            replyText += `\n[System Executed: ${action} on ${deviceId}]`;
          } else if (call.name === 'changeAssistantName') {
            const { newName } = call.args as any;
            await fetch('/api/system/assistant-name', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: newName })
            });
            replyText += `\n[System Executed: Name changed to ${newName}]`;
          }
        }
        fetchStates();
      }

      setChatHistory([...newHistory, `${data?.assistantName || 'Ujo'}: ${response.text || 'Action completed.'}`]);
      setNlpResponse(replyText);
      setVoiceInput('');
      setTimeout(() => setNlpResponse(null), 15000);

      speakResponse(response.text || 'Done.');
    } catch (err) {
      console.error('NLP Parse failed', err);
      speakResponse("I encountered an error while processing that.");
      setNlpResponse("Error connecting to cognitive engine.");
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

  const updateVoiceSetting = async (persona: string, pitch: number, rate: number) => {
    await fetch('/api/voice/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona, pitch, rate })
    });
    fetchStates();
    speakResponse(`Voice personality changed to ${persona}.`);
  };

  const checkSoftwareUpdate = async () => {
    try {
      const res = await fetch('/api/system/check-update', { method: 'POST' });
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
    await fetch('/api/system/toggle-subscription', { method: 'POST' });
    const nextActive = !data?.subscriptionActive;
    speakResponse(nextActive ? "SaaS Pulse activated. Cloud features and updates enabled." : "SaaS Pulse deactivated. Offline mode only.");
  };

  const switchPower = async (source: 'Grid' | 'Inverter' | 'Generator') => {
    await fetch('/api/power-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source })
    });
    speakResponse(`Circuit shift. Now operating on ${source} power. Grid Guardian is scaling loads accordingly.`);
  };

  const simulatePredictive = async () => {
    await fetch('/api/simulate-time', { method: 'POST' });
  };

  const dispatchVendor = async (vendorType: string) => {
    try {
      await fetch('/api/vendor/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorType })
      });
    } catch(e) { console.error(e); }
  };

  const generateGuestQR = async () => {
    try {
      const res = await fetch('/api/security/guest-code', { method: 'POST' });
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
           <div className="flex flex-col items-end">
              <span className="mono-data text-[10px] text-zinc-400">{activeUser} Matrix</span>
              <span className="text-xs font-bold text-white italic capitalize">{data.location}</span>
           </div>
           <AIOrb active={!!nlpResponse} />
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-6 items-start">
        
        {/* Left: Environment & Energy HUD */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          
          <div className="glass-hud p-6">
            <div className="flex items-center gap-2 mb-6">
               <Zap size={14} className="text-[var(--accent-cyan)]" />
               <span className="mono-data text-[10px] text-zinc-400">Grid Guardian</span>
            </div>
            
            <div className="space-y-6">
               <div className="flex justify-between items-end">
                  <div>
                    <span className="block text-[8px] mono-data text-zinc-500">Power Source</span>
                    <span className="text-lg font-bold italic tracking-tight">{data.powerSource}</span>
                  </div>
                  <div className="h-2 w-16 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-[var(--accent-cyan)]" 
                      initial={{ width: 0 }}
                      animate={{ width: `${data.energy.battery}%` }}
                    />
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white/5 border border-white/5 rounded-xl">
                    <span className="block text-[8px] mono-data text-zinc-500">Voltage</span>
                    <span className="text-md font-bold mono-data text-white">{data.energy.voltage}V</span>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/5 rounded-xl">
                    <span className="block text-[8px] mono-data text-zinc-500">Stability</span>
                    <span className="text-md font-bold mono-data text-[var(--accent-cyan)]">STB</span>
                  </div>
               </div>
            </div>
          </div>

          <div className="glass-hud p-6">
            <span className="mono-data text-[10px] text-zinc-400 block mb-4 italic">Operational Protocols</span>
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
          <DigitalTwinMockup />
          
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
             {data.devices.map(dev => (
               <DeviceHUDCard key={dev.id} device={dev} onToggle={() => toggleDevice(dev.id, dev.state)} />
             ))}
          </div>

          <TelemetryStrip data={voltageHistory} />
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
      </AnimatePresence>

      {/* Voice Training Overlay */}
      <AnimatePresence>
        {isTraining && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-2xl grid place-items-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="max-w-md w-full bento-card text-center items-center py-12">
               <div className="w-24 h-24 bg-[var(--accent-gold)]/20 border border-[var(--accent-gold)]/30 rounded-full grid place-items-center mb-8 shadow-2xl shadow-yellow-500/10">
                  <Mic size={40} className="text-[var(--accent-gold)] animate-pulse" />
               </div>
               <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-2">Voice Biometrics</h3>
               <p className="text-zinc-500 text-sm mb-8 font-mono uppercase tracking-widest">Step {trainingStep} of 3 • Local MFCC Extraction</p>
               
               <p className="text-xl font-medium text-white mb-10 leading-relaxed italic">
                 {trainingStep === 1 && `"Hey Ujo, what is the weather like tomorrow?"`}
                 {trainingStep === 2 && `"Ujo, lock the front door and set the alarm."`}
                 {trainingStep === 3 && `"Ujo, turn off the living room lights."`}
               </p>

               <button onClick={nextTrainingStep} className="w-full py-5 bg-[var(--accent-gold)] text-black font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] transition-all">
                 Record Sample
               </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Smart Keypad Overlay */}
      <AnimatePresence>
        {showKeypad && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xl grid place-items-center p-6">
             <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="max-w-xs w-full glass-hud items-center p-8">
                <Lock size={32} className="text-[var(--accent-gold)] mb-6 mx-auto" />
                <h3 className="text-xl font-black italic uppercase tracking-tighter mb-1 text-center">Secure Unlock</h3>
                <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest mb-8 text-center">4-Digit Cryptographic Code Required</p>
                
                <div className="flex gap-3 mb-8 justify-center">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className={`w-3 h-3 rounded-full border border-zinc-700 ${pinBuffer.length >= i ? 'bg-[var(--accent-gold)] border-[var(--accent-gold)]' : ''}`} />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3 w-full mb-8">
                   {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map(val => (
                     <button 
                       key={val} 
                       onClick={() => typeof val === 'number' && handleKeypadPress(val.toString())}
                       className="aspect-square bg-white/5 border border-white/5 rounded-xl grid place-items-center font-black text-lg hover:bg-[var(--accent-gold)] hover:text-black transition-all"
                     >
                       {val}
                     </button>
                   ))}
                </div>

                <div className="flex gap-4 w-full">
                  <button onClick={() => { setShowKeypad(false); setPinBuffer(''); }} className="flex-1 py-4 bg-white/5 border border-white/5 rounded-xl font-bold uppercase text-[10px] tracking-widest">Cancel</button>
                  <button onClick={submitPin} disabled={pinBuffer.length < 4} className="flex-1 py-4 bg-[var(--accent-gold)] text-black rounded-xl font-black uppercase text-[10px] tracking-widest disabled:opacity-30">Authorize</button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Onboarding Overlay */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] bg-[#050505] grid place-items-center p-6"
          >
            <div className="max-w-2xl w-full">
              {onboardingStep === 'intro' && (
                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center flex flex-col items-center">
                  <div className="w-20 h-20 bg-[var(--accent-gold)] rounded-2xl grid place-items-center mb-8 shadow-2xl shadow-yellow-500/20">
                    <Activity size={32} className="text-black" />
                  </div>
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-4">Welcome to Ujo OS</h2>
                  <p className="text-zinc-400 text-lg mb-10 leading-relaxed font-mono">
                    NEURAL_LINK: PENDING<br/>
                    AWAITING_MASTER_REGISTRATION
                  </p>
                  <button 
                    onClick={handleStartSetup}
                    className="group flex items-center gap-4 px-10 py-6 bg-[var(--accent-gold)] text-black rounded-xl font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-yellow-500/10"
                  >
                    Initiate Neural Link <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </motion.div>
              )}

              {onboardingStep === 'scanning' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-hud p-10">
                  <div className="flex justify-between items-center mb-10">
                    <div>
                      <h3 className="text-2xl font-black italic uppercase tracking-tight">Integrity Scan</h3>
                      <p className="text-xs font-mono text-[var(--accent-gold)] uppercase tracking-widest">Probing Z-Bridge Matrix...</p>
                    </div>
                    <RefreshCw size={24} className="animate-spin text-[var(--accent-gold)]" />
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    {data.devices.map(device => {
                      const isScanned = scannedDevices.includes(device.id);
                      return (
                        <motion.div 
                          key={device.id}
                          animate={{ opacity: isScanned ? 1 : 0.3 }}
                          className={`flex items-center justify-between p-4 bg-white/5 rounded-xl border ${isScanned ? 'border-[var(--accent-gold)]/40' : 'border-white/5'}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${isScanned ? 'bg-[var(--accent-gold)]/20 text-[var(--accent-gold)]' : 'bg-zinc-800 text-zinc-500'}`}>
                              <Link size={16} />
                            </div>
                            <span className="text-sm font-bold">{device.name}</span>
                          </div>
                          <span className={`text-[10px] font-mono uppercase ${isScanned ? 'text-[var(--accent-gold)]' : 'text-zinc-600'}`}>
                            {isScanned ? 'Verified' : 'Pending'}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {onboardingStep === 'complete' && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center flex flex-col items-center">
                  <div className="w-24 h-24 bg-[var(--accent-gold)] rounded-full grid place-items-center mb-8 shadow-2xl shadow-yellow-500/40">
                    <Shield size={40} className="text-black" />
                  </div>
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-4">Protection Active</h2>
                  <p className="text-zinc-400 text-lg mb-10 leading-relaxed font-mono">
                    NEURAL_LINK: STABLE<br/>
                    SECURITY_ARMOR: ONLINE
                  </p>
                  <button 
                    onClick={() => setShowOnboarding(false)}
                    className="px-12 py-6 border-2 border-[var(--accent-gold)] text-[var(--accent-gold)] rounded-xl font-black uppercase tracking-widest hover:bg-[var(--accent-gold)] hover:text-black transition-all shadow-xl shadow-yellow-500/5"
                  >
                    Enter Command Center
                  </button>
                </motion.div>
              )}
            </div>
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
    </div>
  );
}
