import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, X } from 'lucide-react';

interface SecurityKeypadProps {
  isOpen: boolean;
  pin: string;
  onPress: (digit: string) => void;
  onClear: () => void;
  onClose: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

export const SecurityKeypad: React.FC<SecurityKeypadProps> = ({ isOpen, pin, onPress, onClear, onClose }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="max-w-sm w-full glass-hud p-8 border-t-2 border-[var(--accent-gold)]/50"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 text-[var(--accent-gold)]">
              <Lock size={24} />
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-white leading-none">Secure Unlock</h2>
                <span className="mono-data text-[9px] tracking-[0.2em] opacity-60">ENTER_4_DIGIT_PIN</span>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 text-zinc-500 hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="flex justify-center gap-3 mb-8">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  pin.length > i ? 'bg-[var(--accent-gold)] border-[var(--accent-gold)]' : 'border-white/20'
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === 'clear') onClear();
                  else if (key === 'back') onPress('back');
                  else onPress(key);
                }}
                className="p-4 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-lg hover:bg-white/10 transition-all uppercase text-xs tracking-widest"
              >
                {key === 'clear' ? 'CLR' : key === 'back' ? '⌫' : key}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
