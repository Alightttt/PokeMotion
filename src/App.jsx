import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Phone, PhoneOff, Mic, MicOff, Grid, Video, 
  Users, Volume2, Plus
} from "lucide-react";
import { VoiceClient } from "realtime-ai";
import { motion, AnimatePresence } from "framer-motion";

export default function App() {
  const [callState, setCallState] = useState('IDLE'); 
  const [transcript, setTranscript] = useState('');
  const [callTimer, setCallTimer] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  
  const clientRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    // Lock viewport to 100svh to prevent Android address bar jitter
    document.documentElement.style.height = '100svh';
    document.body.style.height = '100svh';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
  }, []);

  const initVoiceClient = useCallback(async () => {
    try {
      const response = await fetch('/api/bot', { method: 'POST' });
      const { room_url } = await response.json();

      // Based on RTVI / Pipecat SDK docs, the core client is VoiceClient
      const client = new VoiceClient({
        baseUrl: room_url,
        services: {
          llm: "huggingface",
          tts: "indic-mio",
          stt: "whisper"
        },
        config: [
          { service: "tts", options: [{ name: "voice", value: "male" }] }
        ]
      });

      client.on("botConnected", () => {
        setCallState('ACTIVE');
        setCallTimer(0);
        timerRef.current = setInterval(() => setCallTimer(prev => prev + 1), 1000);
      });

      client.on("botDisconnected", () => {
        endCall();
      });

      client.on("transcript", (text) => {
        setTranscript(text);
      });

      client.on("botSpeaking", () => setIsBotSpeaking(true));
      client.on("botStoppedSpeaking", () => setIsBotSpeaking(false));

      clientRef.current = client;
      await client.start();
    } catch (err) {
      console.error("Failed to init voice client", err);
      setCallState('IDLE');
    }
  }, []);

  const startCall = () => {
    setCallState('DIALING');
    initVoiceClient();
  };

  const endCall = async () => {
    if (clientRef.current) {
      await clientRef.current.stop();
      clientRef.current = null;
    }
    clearInterval(timerRef.current);
    setCallState('IDLE');
    setCallTimer(0);
    setTranscript('');
    setIsBotSpeaking(false);
  };

  const toggleMute = () => {
    if (clientRef.current) {
      const isMuted = !micMuted;
      clientRef.current.setMicMuted(isMuted);
      setMicMuted(isMuted);
    }
  };

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const IconButton = ({ icon: Icon, label, action, active, disabled }) => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-2"
    >
      <button 
        onClick={action}
        disabled={disabled}
        className={`w-[74px] h-[74px] flex items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${active ? 'bg-white text-black scale-105' : 'bg-white/[0.12] text-white hover:bg-white/[0.18]'}
          ${disabled ? 'opacity-20' : 'active:scale-90 shadow-lg'}`}
      >
        <Icon size={32} strokeWidth={1.5} />
      </button>
      <span className={`text-[12px] font-medium tracking-tight text-white/50 ${disabled ? 'opacity-10' : 'opacity-100'}`}>
        {label}
      </span>
    </motion.div>
  );

  return (
    <div className="h-[100svh] w-full bg-black text-white flex flex-col items-center select-none relative overflow-hidden font-sans">
      {/* Apple-inspired Fluid Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0c] via-black to-black" />
      <motion.div 
        animate={{ 
          scale: isBotSpeaking ? [1, 1.2, 1] : 1,
          opacity: isBotSpeaking ? [0.1, 0.2, 0.1] : 0.1
        }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[140%] h-[100%] bg-radial-gradient from-[#0066cc] via-transparent to-transparent blur-[120px] pointer-events-none" 
      />
      
      <AnimatePresence mode="wait">
        {callState === 'IDLE' && (
          <motion.div 
            key="idle"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="z-10 w-full h-full flex flex-col items-center justify-between py-24 px-8 max-w-md"
          >
            <div className="flex flex-col items-center gap-10 mt-20">
              <div className="w-36 h-36 glass rounded-[3.5rem] flex items-center justify-center text-6xl shadow-2xl relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-50" />
                 🌴
              </div>
              <div className="text-center space-y-4">
                <h1 className="text-[48px] font-bold tracking-tight leading-tight">Lord Poke</h1>
                <p className="text-[14px] font-black text-[#0066cc] tracking-[0.4em] uppercase">Pipecat Powered</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-12 pb-16 w-full">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startCall} 
                className="w-24 h-24 bg-[#34C759] text-white flex items-center justify-center rounded-full shadow-[0_25px_60px_rgba(52,199,89,0.4)]"
              >
                <Phone size={40} fill="currentColor" />
              </motion.button>
            </div>
          </motion.div>
        )}

        {(callState === 'ACTIVE' || callState === 'DIALING') && (
          <motion.div 
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="z-10 w-full h-full flex flex-col items-center justify-between py-24 px-8 max-w-md"
          >
            <div className="text-center space-y-3 mt-8">
              <h2 className="text-[42px] font-bold tracking-tight">Lord Poke</h2>
              <p className="text-[24px] tabular-nums text-white/40 font-semibold h-8 tracking-wide">
                {callState === 'ACTIVE' ? formatTime(callTimer) : 'connecting...'}
              </p>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center w-full relative">
              {/* Visual Audio Feedback State */}
              <div className="relative">
                <AnimatePresence>
                  {isBotSpeaking && (
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1.4, opacity: 0.15 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 1, repeat: Infinity, repeatType: "mirror" }}
                      className="absolute inset-0 bg-white rounded-full blur-3xl"
                    />
                  )}
                </AnimatePresence>
                <motion.div 
                  animate={{ 
                    scale: isBotSpeaking ? [1, 1.05, 1] : 1,
                    y: isBotSpeaking ? [0, -5, 0] : 0
                  }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className={`w-44 h-44 rounded-full glass flex items-center justify-center text-7xl shadow-2xl z-20 transition-all duration-700 ${isBotSpeaking ? 'border-white/40 scale-110' : 'border-white/10'}`}
                >
                   🌴
                </motion.div>
              </div>

              <div className="grid grid-cols-3 gap-x-12 gap-y-14 w-full px-4 mt-20">
                <IconButton icon={micMuted ? MicOff : Mic} label="mute" action={toggleMute} active={micMuted} />
                <IconButton icon={Grid} label="keypad" disabled />
                <IconButton icon={Volume2} label="speaker" action={() => setSpeakerOn(!speakerOn)} active={speakerOn} />
                <IconButton icon={Plus} label="add call" disabled />
                <IconButton icon={Video} label="FaceTime" disabled />
                <IconButton icon={Users} label="contacts" disabled />
              </div>
            </div>

            <AnimatePresence>
              {transcript && (
                <motion.div 
                  initial={{ opacity: 0, y: 30, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-[28%] left-1/2 -translate-x-1/2 w-[90%] pointer-events-none z-30"
                >
                  <div className="glass rounded-[2.5rem] p-7 text-[17px] font-semibold leading-relaxed text-white/95 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
                    <span className="text-[#0066cc] font-black block text-[10px] uppercase tracking-[0.2em] mb-2">Live Response</span>
                    {transcript}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pb-8">
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={endCall} 
                className="w-24 h-24 bg-[#FF3B30] text-white flex items-center justify-center rounded-full shadow-[0_25px_60px_rgba(255,59,48,0.4)]"
              >
                <PhoneOff size={40} fill="currentColor" className="rotate-[135deg]" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .glass {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(50px) saturate(210%);
          -webkit-backdrop-filter: blur(50px) saturate(210%);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .bg-radial-gradient {
          background: radial-gradient(circle at center, var(--tw-gradient-from), var(--tw-gradient-to));
        }
      `}</style>
    </div>
  );
}
