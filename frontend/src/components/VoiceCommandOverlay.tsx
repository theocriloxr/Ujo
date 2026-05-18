import React from 'react';
import { Mic, VolumeX, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const VoiceCommandOverlay = ({ isOpen, onClose, onSend, input, setInput, activeZone, voiceConfidence, isVoiceVerified }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSend: (e: React.FormEvent) => void, 
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
            scale: isVoiceVerified ? [1, 1.25, 1] : [1, 1.1, 1],
            boxShadow: isVoiceVerified 
              ? ["0 0 60px rgba(34,211,238,0.4)", "0 0 120px rgba(34,211,238,0.8)", "0 0 60px rgba(34,211,238,0.4)"]
              : ["0 0 20px rgba(250,204,21,0.2)", "0 0 60px rgba(250,204,21,0.4)", "0 0 20px rgba(250,204,21,0.2)"]
          }}
          transition={{ duration: isVoiceVerified ? 0.8 : 2, repeat: Infinity }}
          className={`w-32 h-32 rounded-full border-4 flex items-center justify-center mb-10 transition-all duration-1000 ${isVoiceVerified ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_80px_rgba(34,211,238,0.3)]' : 'bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]'}`}
        >
           {isVoiceVerified ? <CheckCircle size={56} className="text-cyan-400" /> : <Mic size={48} className="text-[var(--accent-gold)]" />}
        </motion.div>

        <div className="max-w-2xl w-full">
           <div className="flex flex-col items-center gap-4 mb-12">
              <span className={`mono-data text-xs tracking-[0.5em] uppercase transition-colors duration-500 ${isVoiceVerified ? 'text-cyan-400' : 'text-[var(--accent-gold)]'}`}>
                {isVoiceVerified ? 'SECURE IDENTITY CONFIRMED' : `Listening in ${activeZone}`}
              </span>
               <div className="flex flex-col items-center gap-2 w-full max-w-sm">
                 <div className="flex items-center justify-between w-full mb-1">
                    <span className="mono-data text-[8px] text-zinc-500 uppercase tracking-widest">Biometric Match Integrity</span>
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
                 {isVoiceVerified && (
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
