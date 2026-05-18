import React, { useState, useCallback, useEffect } from 'react';
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
import type { Alert, SystemData, TrustLog, TrustLogType } from './types/index.ts';
import { AIOrb } from './components/AIOrb.tsx';
import { DigitalTwinMockup } from './components/DigitalTwinMockup.tsx';
import { TelemetryStrip } from './components/TelemetryStrip.tsx';
import { VoiceCommandOverlay } from './components/VoiceCommandOverlay.tsx';
import { DeviceHUDCard } from './components/DeviceHUDCard.tsx';
import { TrustConsole } from './components/TrustConsole.tsx';
import { SecurityKeypad } from './components/SecurityKeypad.tsx';
import { useSystemState } from './hooks/useSystemState.ts';
import { useSystemSocket } from './hooks/useSystemSocket.ts';
import { useVoice } from './hooks/useVoice.ts';

export default function App() {
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
  const [trustLogs, setTrustLogs] = useState<TrustLog[]>([]);
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
  const [showKeypad, setShowKeypad] = useState(false);
  const [pinBuffer, setPinBuffer] = useState('');
  const [lockedActionID, setLockedActionID] = useState<string | null>(null);

  const ambientAudioRef = React.useRef<AudioContext | null>(null);

  const { voiceSettings, speakResponse, fetchVoiceSettings, saveVoiceSettings } = useVoice(
    isGlobalMuted,
    isSaaSTier
  );

  const fetchGuestSessions = async () => {
    try {
      const res = await fetch('/api/security/guest-sessions');
      const json = await res.json();
      setGuestSessions(json);
    } catch (e) { console.error(e); }
  };

  const revokeGuestSession = async (id: string) => {
    const session = guestSessions.find(s => s.id === id);
    if (!session) return;

    if (!window.confirm(`Are you sure you want to revoke access for ${session.name}?`)) {
      return;
    }

    try {
      await fetch('/api/security/revoke-session', {
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
  }, [showSettings, fetchVoiceSettings]);

  useEffect(() => {
    if (pinBuffer.length === 4) void submitPin();
  }, [pinBuffer]);

  const addTrustLog = useCallback((message: string, type: TrustLogType = 'info') => {
    const log = {
      id: Math.random().toString(36).substr(2, 9),
      message,
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      type
    };
    setTrustLogs(prev => [log, ...prev].slice(0, 10));

    // Update Trust Score
    const scoreMap = { success: 1, warning: -2, info: 0, error: -5 };
    setTrustScore(prev => Math.min(100, Math.max(0, prev + scoreMap[type])));
  }, []);

  const {
    data,
    setData,
    haStatus,
    setHaStatus,
    loading,
    voltageHistory,
    setVoltageHistory,
    fetchStates,
  } = useSystemState(speakResponse);

  useSystemSocket({
    setData,
    setHaStatus,
    setVoltageHistory,
    setTrustLogs,
    speakResponse,
    addTrustLog,
    setShowVoiceOverlay,
    setNlpResponse,
    setSpatialPulseMessage,
    setIsLocalConnection,
    fetchStates,
  });

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

  const sendVoiceCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceInput.trim()) return;

    // Simulate voice confidence processing
    const confidence = 85 + Math.random() * 14;
    setVoiceConfidence(confidence);
    setIsVoiceVerified(true);

    try {
      const response = await fetch('/api/nlp-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: voiceInput, 
          room: activeZone,
          securityFlags: { voiceVerified: true, phonePresent: isPhonePresent }
        })
      });

      const result = await response.json();
      setNlpResponse(result.response);
      addTrustLog(`NLP: Command processed (${confidence.toFixed(0)}% confidence). ${result.response}`, result.success ? 'success' : 'info');
      
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

  const switchPowerSource = async (source: string) => {
    try {
      await fetch('/api/power-state', {
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

  const handleKeypadPress = (num: string) => {
    if (num === 'back') {
      setPinBuffer((prev) => prev.slice(0, -1));
      return;
    }
    if (pinBuffer.length < 4) setPinBuffer((prev) => prev + num);
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
        setLockedActionID(null);
        fetchStates();
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


  const handleVaultAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultError(null);
    try {
      const res = await fetch('/api/system/vault/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: vaultPin })
      });
      if (res.ok) {
        setShowVaultAuth(false);
        setVaultPin('');
        speakResponse("Manual PIN override confirmed. Executing Vault protocol.");
        
        const nlpRes = await fetch('/api/nlp-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: vaultAction, 
            room: activeZone,
            securityFlags: { voiceVerified: true, phonePresent: true }
          }),
        });
        const nlpData = await nlpRes.json();
        speakResponse(nlpData.response);
        setNlpResponse(nlpData.response);
        setTimeout(() => setNlpResponse(null), 10000);
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
      await fetch('/api/system/onboarding/qr-handshake', { method: 'POST' });
      setOnboardingStep('voice');
      speakResponse("Link confirmed. Welcome, Admin. Please read the calibration sentences displayed on your device.");
    } else {
      await fetch('/api/system/onboarding/voice-calibrate', { method: 'POST' });
      setOnboardingStep('complete');
      speakResponse("Setup complete. Ujo OS is now active and customized for your voice signature.");
      setTimeout(() => setShowOnboarding(false), 2000);
      addTrustLog("New SuperAdmin Biometric Signature Created", 'success');
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
    await fetch('/api/motion/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'Living Room' }),
    });
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

  const findMyPhone = async () => {
    setIsFindingPhone(true);
    setPhoneTrackingResult(null);
    speakResponse("Verifying BLE RSSI signatures across edge microphones. One moment.");
    
    try {
      const res = await fetch('/api/system/find-phone', { method: 'POST' });
      const json = await res.json();
      
      setTimeout(() => {
        setIsFindingPhone(false);
        setPhoneTrackingResult(json);
        if (json.status === 'ONLINE') {
          speakResponse(`Triangulation successful. Your phone is currently in the ${json.room}. Playing sonar ping now.`);
        } else {
          speakResponse(json.message);
        }
      }, 3000);
    } catch (e) {
      setIsFindingPhone(false);
      speakResponse("Unable to locate phone signature. Offline logs unavailable.");
    }
  };

  const toggleSaaSTier = () => {
    const next = !isSaaSTier;
    setIsSaaSTier(next);
    speakResponse(next 
      ? "SaaS Premium Tier activated. Realistic voice engine and vendor automation unlocked." 
      : "Reverting to Free Tier. Local core remains active. ElevenLabs and Twilio fallbacks disabled."
    );
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
                     className={`w-10 h-5 rounded-full relative transition-all ${isSaaSTier ? 'bg-cyan-500' : 'bg-zinc-700'}`}
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
          <DigitalTwinMockup />
          
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
             {data.devices.map((device) => (
               <DeviceHUDCard
                 key={device.id}
                 device={device}
                 onToggle={() => toggleDevice(device.id, device.state)}
                 isExpanded={expandedDeviceId === device.id}
                 onExpand={() =>
                   setExpandedDeviceId(expandedDeviceId === device.id ? null : device.id)
                 }
               />
             ))}
          </div>

          <TelemetryStrip history={voltageHistory} />
        </div>

        <TrustConsole trustLogs={trustLogs} haStatus={haStatus} onSyncHA={syncHA} />

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
        input={voiceInput}
        setInput={setVoiceInput}
        activeZone={activeZone}
        voiceConfidence={voiceConfidence}
        isVoiceVerified={isVoiceVerified}
      />

      <SecurityKeypad
        isOpen={showKeypad}
        pin={pinBuffer}
        onPress={handleKeypadPress}
        onClear={() => setPinBuffer('')}
        onClose={() => {
          setShowKeypad(false);
          setPinBuffer('');
          setLockedActionID(null);
        }}
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

      {/* HITL Alerts Overlay — one card at a time; multiple DB alerts stack confusingly */}
      <AnimatePresence>
        {data && data.alerts.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center gap-4 p-6 text-center">
            {data.alerts.length > 1 && (
              <p className="mono-data text-[10px] text-zinc-500 uppercase tracking-widest">
                {data.alerts.length - 1} more in queue after this action
              </p>
            )}
            <motion.div key={data.alerts[0].id} initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }} className="max-w-lg w-full glass-hud border-t-8 border-t-[var(--alert-red)] p-10">
                <div className="flex flex-col items-center mb-8">
                  <div className="p-4 bg-red-500/10 rounded-full text-red-500 shadow-lg mb-6">
                    <AlertTriangle size={48} />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tight italic mb-2">{data.alerts[0].title}</h3>
                  <p className="mono-data text-[10px] text-red-500 mb-6">Intervention Required</p>
                  <p className="text-zinc-200 text-lg leading-relaxed font-medium">"{data.alerts[0].message}"</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <button type="button" onClick={() => confirmAlert(data.alerts[0].id, 'Ignore')} className="py-5 px-6 rounded-xl font-bold text-zinc-500 bg-white/5 hover:bg-white/10 transition-all uppercase text-[10px] tracking-widest">Decline</button>
                  <button type="button" onClick={() => confirmAlert(data.alerts[0].id, 'Confirm')} className="py-5 px-6 rounded-xl font-black bg-[var(--alert-red)] text-white hover:scale-[1.02] transition-all uppercase text-[10px] tracking-widest flex items-center justify-center gap-3">
                    Confirm Action
                  </button>
                </div>
              </motion.div>
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
