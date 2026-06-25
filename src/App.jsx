import React, { useState, useRef, useEffect, useCallback } from "react";
import DailyIframe from "@daily-co/daily-js";
import { 
  Phone, PhoneOff, Mic, MicOff, Grid, Video, 
  Users, Volume2, Plus, Info, Layout, Activity
} from "lucide-react";
import { audioEngine } from './AudioEngine';

export default function App() {
  const [callState, setCallState] = useState('IDLE'); // IDLE, DIALING, RINGING, ACTIVE
  const [callTimer, setCallTimer] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [transcript, setTranscript] = useState('');
  
  const dailyRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (dailyRef.current) dailyRef.current.destroy();
      clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startCall = async () => {
    try {
      setCallState('DIALING');
      audioEngine.init();
      const dialCleanup = audioEngine.playDialTone();

      const response = await fetch('/api/bot', { method: 'POST' });
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);

      const callObject = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
      });
      dailyRef.current = callObject;

      callObject.on('joined-meeting', () => {
        dialCleanup();
        setCallState('ACTIVE');
        setCallTimer(0);
        timerRef.current = setInterval(() => setCallTimer(prev => prev + 1), 1000);
      });

      callObject.on('left-meeting', () => {
        endCall();
      });

      callObject.on('app-message', (evt) => {
        if (evt.data?.transcript) {
          setTranscript(evt.data.transcript);
        }
      });

      await callObject.join({ url: data.room_url });

    } catch (err) {
      console.error("Call failed:", err);
      setCallState('IDLE');
    }
  };

  const endCall = async () => {
    if (dailyRef.current) {
      await dailyRef.current.leave();
      dailyRef.current.destroy();
      dailyRef.current = null;
    }
    clearInterval(timerRef.current);
    setCallState('IDLE');
    setCallTimer(0);
    setTranscript('');
  };

  const toggleMute = () => {
    if (dailyRef.current) {
      const isMuted = dailyRef.current.localAudio();
      dailyRef.current.setLocalAudio(!isMuted);
      setMicMuted(isMuted);
    }
  };

  const IconButton = ({ icon: Icon, label, action, active, disabled }) => (
    <div className="flex flex-col items-center gap-2">
      <button 
        onClick={action}
        disabled={disabled}
        className={`w-16 h-16 sm:w-[72px] sm:h-[72px] flex items-center justify-center rounded-full transition-all duration-500
          ${active ? 'bg-white text-black scale-105' : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-xl border border-white/10'}
          ${disabled ? 'opacity-20' : 'active:scale-95'}`}
      >
        <Icon size={28} strokeWidth={1.5} fill={active ? 'currentColor' : 'none'} />
      </button>
      <span className="text-[10px] font-bold tracking-[0.1em] text-white/30 uppercase">
        {label}
      </span>
    </div>
  );

  return (
    <div className="min-h-[100vh] min-h-[100dvh] w-full bg-black text-white flex flex-col items-center select-none relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-gradient-to-b from-[#1c1c1e] via-black to-black" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-radial-gradient from-[#0066cc]/15 via-transparent to-transparent blur-[120px] pointer-events-none" />
      
      {callState === 'IDLE' && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-16 px-8 max-w-md animate-apple-in">
          <div className="flex flex-col items-center gap-10 mt-16">
            <div className="w-32 h-32 glass rounded-[3rem] flex items-center justify-center text-6xl shadow-[0_0_50px_rgba(255,255,255,0.1)] relative overflow-hidden group">
               <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
               🌴
            </div>
            <div className="text-center space-y-3">
              <h1 className="text-5xl font-bold tracking-tight">Lord Poke</h1>
              <div className="flex items-center justify-center gap-2">
                <Activity size={14} className="text-[#34C759]" />
                <p className="text-[12px] font-bold text-[#0066cc] tracking-[0.4em] uppercase">Neural Link Ready</p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-12 pb-12 w-full">
            <button onClick={startCall} className="w-24 h-24 bg-[#34C759] text-white flex items-center justify-center rounded-full shadow-[0_20px_60px_rgba(52,199,89,0.4)] active:scale-95 spring-transition hover:scale-110">
              <Phone size={42} fill="currentColor" />
            </button>
            <p className="text-white/20 text-[13px] font-medium tracking-wide uppercase">Encrypted Connection</p>
          </div>
        </div>
      )}

      {(callState === 'ACTIVE' || callState === 'DIALING') && (
        <div className="z-10 w-full h-full flex flex-col items-center animate-apple-in px-6">
          <div className="text-center space-y-1 mt-20 mb-8">
            <h2 className="text-[42px] font-bold tracking-tight">Lord Poke</h2>
            <p className="text-2xl tabular-nums text-white/30 font-medium h-8 tracking-wider">
              {callState === 'ACTIVE' ? formatTime(callTimer) : 'connecting...'}
            </p>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm gap-16">
            <div className={`w-44 h-44 rounded-full glass flex items-center justify-center text-7xl relative transition-transform duration-1000 ${callState === 'ACTIVE' ? 'scale-110' : 'scale-100'}`}>
               {callState === 'ACTIVE' && (
                 <div className="absolute inset-0 rounded-full animate-pulse border-2 border-white/10 scale-125" />
               )}
               🌴
            </div>
            
            <div className="grid grid-cols-3 gap-x-12 gap-y-12 w-full">
              <IconButton icon={micMuted ? MicOff : Mic} label="mute" action={toggleMute} active={micMuted} />
              <IconButton icon={Grid} label="keypad" disabled />
              <IconButton icon={Volume2} label="speaker" action={() => setSpeakerOn(!speakerOn)} active={speakerOn} />
              <IconButton icon={Plus} label="add" disabled />
              <IconButton icon={Video} label="video" disabled />
              <IconButton icon={Info} label="info" disabled />
            </div>
          </div>

          <div className="w-full max-w-md mb-12 flex flex-col items-center gap-10">
            {transcript && (
              <div className="w-full glass rounded-[2.5rem] p-6 text-[17px] font-medium leading-relaxed text-white/90 shadow-2xl border border-white/20">
                <p>{transcript}</p>
              </div>
            )}
            <button onClick={endCall} className="w-24 h-24 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-95 spring-transition shadow-[0_20px_60px_rgba(255,59,48,0.4)] hover:scale-110">
              <PhoneOff size={42} fill="currentColor" className="rotate-[135deg]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
