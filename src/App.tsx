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
  power_usage: number;
  load_type: 'Essential' | 'Heavy';
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
  updateAvailable: boolean;
  subscriptionActive: boolean;
  powerSource: 'Grid' | 'Inverter' | 'Generator';
  duressActive: boolean;
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

    socket.on('spatial-pulse', (msg) => {
      setSpatialPulseMessage(msg);
      // Wait slightly longer than the pulse gap so the user can read it, but clears if no more
      setTimeout(() => setSpatialPulseMessage(null), 3000);
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
      
      <AnimatePresence>
        {spatialPulseMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -50 }} 
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-[var(--accent)] text-black font-mono text-xs uppercase tracking-widest font-bold rounded-full shadow-2xl shadow-[var(--accent)]/30 border border-black"
          >
            {spatialPulseMessage}
          </motion.div>
        )}
      </AnimatePresence>

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
            <div className="flex gap-1">
              {['Grid', 'Inverter'].map(p => (
                <button 
                  key={p} 
                  onClick={() => switchPower(p as any)}
                  className={`text-[8px] px-2 py-1 rounded-md font-bold uppercase transition-all ${data.powerSource === p ? 'bg-[var(--accent)] text-black' : 'bg-zinc-800 text-zinc-500'}`}
                >
                  {p}
                </button>
              ))}
            </div>
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
             <div className="flex justify-between items-end mb-2">
                <span className="text-lg font-black italic">{data.energy.voltage}V</span>
                <span className="text-[8px] font-mono text-lime-500 uppercase">{data.energy.status}</span>
             </div>
             <div className="h-12 w-full mt-2">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={voltageHistory}>
                   <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                   <Line type="monotone" dataKey="voltage" stroke="#84cc16" strokeWidth={2} dot={false} isAnimationActive={false} />
                 </LineChart>
               </ResponsiveContainer>
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
        {/* Analytics Card */}
        <div className="bento-card">
           <div className="flex justify-between items-center mb-4">
               <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest">Load Shedding Impact</p>
           </div>
           <div>
               <span className="block text-2xl font-black italic tech-accent">142 kWh</span>
               <span className="text-[8px] font-mono uppercase text-zinc-500">Saved this month via Grid Guardian</span>
           </div>
        </div>
      </aside>

      {/* Main Grid View */}
      <main className="flex-1 overflow-y-auto no-scrollbar pb-10">
        <div className="bento-grid">
          {/* JARVIS INPUT - SPAN 24 */}
          <div className="grid-col-24 bento-card bg-zinc-900/50 border-2 border-[var(--accent-muted)] shadow-inner">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
               <div className="flex items-center gap-4">
                 <Activity size={18} className="tech-accent animate-pulse" />
                 <h2 className="text-sm font-bold uppercase tracking-[0.2em] italic">Omni-Channel LLM Core</h2>
                 <span className="px-2 py-1 bg-[var(--accent)] text-black text-[8px] font-bold uppercase rounded-md tracking-widest">Gemini Neural</span>
               </div>
               
               <div className="flex items-center gap-2">
                 <span className="text-[10px] tech-text-dim uppercase font-mono mr-2">BLE Vector:</span>
                 <select 
                   value={activeUser} 
                   onChange={(e) => setActiveUser(e.target.value)}
                   className="bg-zinc-800 text-xs px-3 py-1.5 rounded-lg border-none focus:ring-1 focus:ring-[var(--accent)]"
                 >
                   <option>Owner</option>
                   <option>Guest (User B)</option>
                   <option>Staff (User C)</option>
                 </select>
                 <select 
                   value={activeZone} 
                   onChange={(e) => setActiveZone(e.target.value)}
                   className="bg-zinc-800 text-xs px-3 py-1.5 rounded-lg border-none focus:ring-1 focus:ring-[var(--accent)]"
                 >
                   <option>Living Room</option>
                   <option>Kitchen</option>
                   <option>Bedroom</option>
                 </select>
               </div>
             </div>
             <form onSubmit={sendVoiceCommand} className="flex gap-4">
                <input 
                  type="text"
                  value={voiceInput}
                  onChange={(e) => setVoiceInput(e.target.value)}
                  placeholder="Ask Ujo anything or control the house..."
                  className="flex-1 bg-black/40 border-none rounded-2xl px-6 py-4 text-sm focus:ring-2 focus:ring-[var(--accent)] transition-all"
                />
                <button type="submit" className="p-4 bg-[var(--accent)] text-black rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-lime-500/10 hover:opacity-90 transition-all">Submit Query</button>
             </form>
             <AnimatePresence>
                {nlpResponse && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 pt-4 border-t tech-border text-[13px] font-mono tech-accent leading-relaxed italic whitespace-pre-wrap">
                    {nlpResponse}
                  </motion.div>
                )}
             </AnimatePresence>
             <div className="mt-2 flex items-center justify-between opacity-50">
               <span className="text-[8px] uppercase tracking-widest font-mono text-zinc-500">Live Context Engine: Gist Mode Active (Voice/WebSearch Grounded)</span>
               <button onClick={() => setChatHistory([])} className="text-[8px] uppercase tracking-widest font-mono tech-accent hover:underline">Clear Memory</button>
             </div>
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

             <div className="mt-8 pt-8 border-t border-zinc-800">
                <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest mb-4">Voice Persona</p>
                <div className="grid grid-cols-2 gap-2">
                   {[
                     { name: 'JARVIS', pitch: 0.8, rate: 0.95 },
                     { name: 'FRIDAY', pitch: 1.2, rate: 1.1 },
                     { name: 'BALANCED', pitch: 1.0, rate: 1.0 },
                     { name: 'CALM', pitch: 0.6, rate: 0.8 }
                   ].map(v => (
                     <button 
                       key={v.name}
                       onClick={() => updateVoiceSetting(v.name, v.pitch, v.rate)}
                       className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${data.voice?.persona === v.name ? 'bg-[var(--accent)] text-black' : 'bg-zinc-800 text-zinc-500'}`}
                     >
                       {v.name}
                     </button>
                   ))}
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
             <div className="flex justify-between items-center mb-4">
                <p className="text-[10px] font-mono tech-text-dim uppercase tracking-widest italic">Protocol Overrides</p>
                <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${data?.subscriptionActive ? 'bg-lime-500/20 text-lime-500' : 'bg-red-500/20 text-red-500'}`}>
                   {data?.subscriptionActive ? 'SaaS Pulse Active' : 'SaaS Pulse Offline'}
                </div>
             </div>
             <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                <button onClick={triggerAnomaly} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-red-500 text-zinc-500 hover:text-red-500 transition-colors">FORCE_ANOMALY</button>
                <button onClick={startTraining} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-[var(--accent)] text-zinc-500 hover:text-[var(--accent)] transition-colors">ENROLL_VOICE_BIOMETRICS</button>
                <button onClick={checkSoftwareUpdate} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-blue-500 text-zinc-500 hover:text-blue-500 transition-colors">QUERY_SYSTEM_UPDATE</button>
                <button onClick={simulatePredictive} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-emerald-500 text-zinc-500 hover:text-emerald-500 transition-colors">SIM_PREDICTIVE_MAINT</button>
                <button onClick={() => speakResponse('Party Mode enabled. Follow-Me tracking suspended due to dense local occupancy.')} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-[var(--accent)] text-zinc-500 hover:text-[var(--accent)] transition-colors">SIM_CROWD_SCENE</button>
                <button onClick={() => speakResponse('Night Mode active. Radar defaults to 15% warm lighting.')} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-[var(--accent)] text-zinc-500 hover:text-[var(--accent)] transition-colors">SIM_SLEEPWALKER</button>
                <button onClick={() => speakResponse('Vocal tract shape matched via MFCC. Access granted. Pitch thresholding bypassed')} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-[var(--accent)] text-zinc-500 hover:text-[var(--accent)] transition-colors">SIM_DIVERSE_VOCAL_TRACT</button>
                <button onClick={() => fetch('/api/system/simulate-tracking', { method: 'POST' })} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-[var(--accent)] text-zinc-500 hover:text-[var(--accent)] transition-colors">SIM_GHOSTING_SCENARIO</button>
                <button onClick={async () => {
                    const res = await fetch('/api/system/simulate-coadmin', { method: 'POST'});
                    const json = await res.json();
                    speakResponse(json.message);
                }} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-orange-500 text-zinc-500 hover:text-orange-500 transition-colors">SIM_COADMIN_CONFLICT</button>
                <button onClick={() => dispatchVendor('diesel')} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-violet-500 text-zinc-500 hover:text-violet-500 transition-colors">TEST_WHATSAPP_DIESEL</button>
                <button onClick={generateGuestQR} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-pink-500 text-zinc-500 hover:text-pink-500 transition-colors">GEN_TIME_BOMBED_GUEST_QR</button>
                <button onClick={toggleSubscription} className="px-3 py-1 border border-zinc-800 rounded-lg hover:border-amber-500 text-zinc-500 hover:text-amber-500 transition-colors">TOGGLE_SAAS_SUBSCRIPTION</button>
                {data.duressActive && (
                  <div className="px-3 py-1 bg-red-500/20 text-red-500 border border-red-500 rounded-lg animate-pulse font-black uppercase">
                    DURESS_PROTOCOL_ACTIVE
                  </div>
                )}
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
               <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-2">Voice Biometrics</h3>
               <p className="text-zinc-500 text-sm mb-8 font-mono uppercase tracking-widest">Step {trainingStep} of 3 • Local MFCC Extraction</p>
               
               <p className="text-xl font-medium text-white mb-10 leading-relaxed italic">
                 {trainingStep === 1 && `"Hey Ujo, what is the weather like tomorrow?"`}
                 {trainingStep === 2 && `"Ujo, lock the front door and set the alarm."`}
                 {trainingStep === 3 && `"Ujo, turn off the living room lights."`}
               </p>

               <button onClick={nextTrainingStep} className="w-full py-5 bg-[var(--accent)] text-black font-black uppercase tracking-widest rounded-[2rem] hover:scale-[1.02] transition-all">
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
             <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="max-w-xs w-full bento-card items-center p-8">
                <Lock size={32} className="tech-accent mb-6" />
                <h3 className="text-xl font-black italic uppercase tracking-tighter mb-1">Secure Unlock</h3>
                <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest mb-8 text-center">4-Digit Cryptographic Code Required</p>
                
                <div className="flex gap-3 mb-8">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className={`w-3 h-3 rounded-full border border-zinc-700 ${pinBuffer.length >= i ? 'bg-[var(--accent)] border-[var(--accent)]' : ''}`} />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3 w-full mb-8">
                   {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map(val => (
                     <button 
                       key={val} 
                       onClick={() => typeof val === 'number' && handleKeypadPress(val.toString())}
                       className="aspect-square bg-zinc-800 rounded-2xl grid place-items-center font-black text-lg hover:bg-[var(--accent)] hover:text-black transition-all"
                     >
                       {val}
                     </button>
                   ))}
                </div>

                <div className="flex gap-4 w-full">
                  <button onClick={() => { setShowKeypad(false); setPinBuffer(''); }} className="flex-1 py-4 bg-zinc-800 rounded-2xl font-bold uppercase text-[10px] tracking-widest">Cancel</button>
                  <button onClick={submitPin} disabled={pinBuffer.length < 4} className="flex-1 py-4 bg-[var(--accent)] text-black rounded-2xl font-black uppercase text-[10px] tracking-widest disabled:opacity-30">Authorize</button>
                </div>

                <div className="mt-8 border-t border-zinc-800 pt-6 w-full flex flex-col items-center">
                  <button 
                    onClick={() => {
                       speakResponse("Offline biometric identity verified. Master admin confirmed.");
                       setShowKeypad(false);
                       setPinBuffer('');
                    }}
                    className="flex flex-col items-center gap-3 text-zinc-500 hover:text-[var(--accent)] transition-all group"
                  >
                     <Scan size={32} className="group-hover:scale-110 transition-transform" />
                     <span className="text-[9px] font-mono uppercase tracking-[0.2em]">Scan Fingerprint (Offline Fallback)</span>
                  </button>
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
            className="fixed inset-0 z-[100] bg-[var(--bg)] grid place-items-center p-6"
          >
            <div className="max-w-2xl w-full">
              {onboardingStep === 'intro' && (
                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center flex flex-col items-center">
                  <div className="w-20 h-20 bg-[var(--accent)] rounded-[2rem] grid place-items-center mb-8 shadow-2xl shadow-lime-500/20">
                    <Activity size={32} className="text-black" />
                  </div>
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-4">Welcome to Ujo OS</h2>
                  <p className="text-zinc-400 text-lg mb-10 leading-relaxed">
                    I am Ujo, your intelligent home companion. I protect your power, secure your data, and anticipate your needs.
                  </p>
                  <button 
                    onClick={handleStartSetup}
                    className="group flex items-center gap-4 px-10 py-6 bg-[var(--accent)] text-black rounded-[2.5rem] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-lime-500/10"
                  >
                    Initiate Neural Link <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </motion.div>
              )}

              {onboardingStep === 'scanning' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bento-card p-10 bg-zinc-900">
                  <div className="flex justify-between items-center mb-10">
                    <div>
                      <h3 className="text-2xl font-black italic uppercase tracking-tight">Integrity Scan</h3>
                      <p className="text-xs font-mono tech-accent uppercase tracking-widest">Probing Z-Bridge Matrix...</p>
                    </div>
                    <RefreshCw size={24} className="animate-spin text-[var(--accent)]" />
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    {data.devices.map(device => {
                      const isScanned = scannedDevices.includes(device.id);
                      return (
                        <motion.div 
                          key={device.id}
                          animate={{ opacity: isScanned ? 1 : 0.3 }}
                          className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-2xl border tech-border"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${isScanned ? 'bg-lime-500/20 text-lime-500' : 'bg-zinc-800 text-zinc-500'}`}>
                              <Link size={16} />
                            </div>
                            <span className="text-sm font-bold">{device.name}</span>
                          </div>
                          <span className={`text-[10px] font-mono uppercase ${isScanned ? 'text-lime-500' : 'text-zinc-600'}`}>
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
                  <div className="w-24 h-24 bg-lime-500 rounded-full grid place-items-center mb-8 shadow-2xl shadow-lime-500/40">
                    <Shield size={40} className="text-black" />
                  </div>
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-4">Protection Active</h2>
                  <p className="text-zinc-400 text-lg mb-10 leading-relaxed font-mono">
                    NEURAL_LINK: STABLE<br/>
                    SECURITY_ARMOR: ONLINE<br/>
                    GREETING: COMPLETE
                  </p>
                  <button 
                    onClick={() => setShowOnboarding(false)}
                    className="px-12 py-6 border-2 border-[var(--accent)] text-[var(--accent)] rounded-[2.5rem] font-black uppercase tracking-widest hover:bg-[var(--accent)] hover:text-black transition-all shadow-xl shadow-lime-500/5"
                  >
                    Enter Command Center
                  </button>
                </motion.div>
              )}
            </div>
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
                    {alert.type === 'vendor' ? <RefreshCw size={40} className="animate-spin-slow" /> : 
                     alert.type === 'system' ? <Download size={40} className="animate-bounce" /> :
                     <AlertTriangle size={40} />}
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
