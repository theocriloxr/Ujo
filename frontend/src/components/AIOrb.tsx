import { motion } from 'motion/react';

export const AIOrb = ({ active, isVerified }: { active: boolean; isVerified?: boolean }) => (
  <motion.div className="relative w-12 h-12 flex items-center justify-center">
    <motion.div
      animate={{
        scale: active ? [0.8, 1.2, 0.8] : [0.9, 1.1, 0.9],
        opacity: active ? [0.3, 0.6, 0.3] : [0.05, 0.1, 0.05],
        boxShadow: active
          ? isVerified
            ? [
                '0 0 20px rgba(34,211,238,0.3)',
                '0 0 60px rgba(34,211,238,0.5)',
                '0 0 20px rgba(34,211,238,0.3)',
              ]
            : [
                '0 0 20px rgba(250,204,21,0.2)',
                '0 0 60px rgba(250,204,21,0.4)',
                '0 0 20px rgba(250,204,21,0.2)',
              ]
          : 'none',
      }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      className={`absolute inset-0 rounded-full blur-xl transition-colors duration-1000 ${isVerified ? 'bg-cyan-500' : 'bg-[var(--accent-gold)]'}`}
    />
    <motion.div
      animate={{
        boxShadow: active
          ? isVerified
            ? [
                '0 0 30px rgba(34,211,238,0.4)',
                '0 0 80px rgba(34,211,238,0.8)',
                '0 0 30px rgba(34,211,238,0.4)',
              ]
            : [
                '0 0 20px rgba(250,204,21,0.2)',
                '0 0 50px rgba(250,204,21,0.6)',
                '0 0 20px rgba(250,204,21,0.2)',
              ]
          : '0 0 10px rgba(250,204,21,0.1)',
      }}
      transition={{ duration: 2, repeat: Infinity }}
      className={`w-10 h-10 rounded-full relative z-10 border-t-2 border-white/20 shadow-2xl transition-all duration-1000 ${
        active
          ? isVerified
            ? 'bg-gradient-to-tr from-cyan-700 via-cyan-400 to-cyan-100 scale-110 shadow-[0_0_40px_rgba(34,211,238,0.4)]'
            : 'bg-gradient-to-tr from-yellow-700 via-[var(--accent-gold)] to-yellow-100 scale-110 shadow-[0_0_30px_rgba(250,204,21,0.3)]'
          : 'bg-zinc-800 border-zinc-700/50 grayscale opacity-40'
      }`}
    >
      <motion.div className="absolute inset-1 rounded-full bg-black/20 backdrop-blur-[2px] overflow-hidden">
        <motion.div
          animate={{ rotate: 360, opacity: active ? [0.1, 0.4, 0.1] : 0 }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.4),transparent_60%)]"
        />
      </motion.div>
    </motion.div>
    {active && (
      <motion.div
        initial={{ rotate: 0, scale: 0.8, opacity: 0 }}
        animate={{ rotate: 360, scale: 1.4, opacity: 0.2 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 rounded-full border border-[var(--accent-gold)] border-dashed"
      />
    )}
  </motion.div>
);
