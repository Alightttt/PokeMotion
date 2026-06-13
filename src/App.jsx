import React, { useState, useRef, useEffect } from "react";
import Peer from 'peerjs';
import { 
  Phone, PhoneOff, Mic, MicOff, Grid, UserPlus, Video, 
  Users, Volume2, Plus, Info, MessageSquare, SignalHigh
} from "lucide-react";
import { audioEngine } from './AudioEngine';

const INDIC_MIO_API = "https://api-inference.huggingface.co/models/SPRINGLab/Indic-Mio";
const LLM_API = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct";
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || ""; 

export default function App() {
  const [peerId, setPeerId] = useState('');
  const [callState, setCallState] = useState('IDLE'); 
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioCleanupRef = useRef(null);
  const ttsAudioRef = useRef(new Audio());
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);
  const processingRef = useRef(false);
  
  const isLordPoke = new URLSearchParams(window.location.search).get('station') === '001';

  const stopTone = () => {
    if (audioCleanupRef.current) {
      audioCleanupRef.current();
      audioCleanupRef.current = null;
    }
  };

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const peer = new Peer(isLordPoke ? 'LORD_POKE_STATION_001' : undefined);
    peerRef.current = peer;
    peer.on('open', setPeerId);
    
    peer.on('call', (incomingCall) => {
      if (isLordPoke) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          localStreamRef.current = stream;
          incomingCall.answer(stream); 
          setupCall(incomingCall);
        });
      } else {
        setCallState('INCOMING');
        callRef.current = incomingCall;
        stopTone();
        audioCleanupRef.current = audioEngine.playRingTone();
      }
    });

    return () => {
      peer.destroy();
      clearInterval(timerRef.current);
    };
  }, [isLordPoke]);

  const initSTT = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = false;
    
    recognitionRef.current.onresult = (event) => {
      if (processingRef.current) return;
      const text = event.results[event.results.length - 1][0].transcript;
      if (isLordPoke && text.trim().length > 0) {
        getLordPokeResponse(text.trim());
      }
    };

    recognitionRef.current.onend = () => {
      if (callState === 'ACTIVE') {
        try {
          recognitionRef.current.start();
        } catch(e) {}
      }
    };

    recognitionRef.current.start();
  };

  const getLordPokeResponse = async (userText) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    setTranscript(`User: ${userText}`);
    
    try {
      const response = await fetch(LLM_API, {
        headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ 
          inputs: `<|im_start|>system\nYou are Lord Poke, a powerful, blunt, and slightly arrogant AI overlord. You speak in fast, snappy Hinglish. Your tone is commanding but natural. Keep responses short, direct, and witty. No system-speak.<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`,
          parameters: { max_new_tokens: 60, stop: ["<|im_end|>", "\n"] }
        }),
      });
      const result = await response.json();
      const aiText = result[0]?.generated_text?.split('assistant\n')[1] || "Haan, kya hai?";
      await speak(aiText.trim());
    } catch (err) {
      await speak("Net slow hai, fir se bol.");
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  };

  const speak = async (text) => {
    try {
      const response = await fetch(INDIC_MIO_API, {
        headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ inputs: text }),
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      ttsAudioRef.current.src = url;
      setTranscript(`Lord Poke: ${text}`);
      await ttsAudioRef.current.play();
    } catch (err) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'hi-IN';
      window.speechSynthesis.speak(utterance);
      setTranscript(`Lord Poke: ${text}`);
    }
  };

  const setupCall = (call) => {
    callRef.current = call;
    call.on('stream', (stream) => {
      stopTone();
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play();
      }
      setCallState('ACTIVE');
      setCallTimer(0);
      timerRef.current = setInterval(() => setCallTimer(prev => prev + 1), 1000);
      initSTT();
      if (isLordPoke) speak("Haan, Lord Poke bol raha hoon. Bolo.");
    });
    call.on('close', endCall);
  };

  const startCall = async () => {
    audioEngine.init();
    setCallState('DIALING');
    audioCleanupRef.current = audioEngine.playDialTone();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const call = peerRef.current.call('LORD_POKE_STATION_001', stream);
      setupCall(call);
    } catch (err) {
      endCall();
    }
  };

  const endCall = () => {
    stopTone();
    callRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    recognitionRef.current?.stop();
    clearInterval(timerRef.current);
    processingRef.current = false;
    setCallState('IDLE');
    setCallTimer(0);
    setTranscript('');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setMicMuted(!audioTrack.enabled);
    }
  };

  if (callState === 'IDLE') {
    return (
      <div className="h-[100svh] bg-black text-[#D4AF37] font-mono flex flex-col p-8 select-none">
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="w-32 h-32 bg-[#1a1a1a] flex items-center justify-center text-6xl border border-[#D4AF37]/20">🌴</div>
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tighter mb-1">Lord Poke</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">Status: Online</p>
          </div>
        </div>
        <div className="pb-12 flex justify-center">
          <button onClick={startCall} className="w-20 h-20 bg-[#D4AF37] text-black flex items-center justify-center rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(212,175,55,0.3)]">
            <Phone size={32} fill="currentColor" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100svh] bg-black text-[#D4AF37] font-mono flex flex-col select-none relative overflow-hidden">
      <div className="pt-20 text-center flex-none">
        <h2 className="text-4xl font-bold tracking-tighter mb-2">Lord Poke</h2>
        <p className="text-xl tabular-nums opacity-80 h-8">
          {callState === 'ACTIVE' ? formatTime(callTimer) : 'calling...'}
        </p>
      </div>

      <div className="flex-1 px-12 flex items-center">
        <div className="w-full grid grid-cols-3 gap-y-10 gap-x-4">
          {[
            { icon: micMuted ? MicOff : Mic, label: 'mute', action: toggleMute, active: micMuted },
            { icon: Grid, label: 'keypad', action: () => {}, disabled: true },
            { icon: Volume2, label: 'audio', action: () => setSpeakerOn(!speakerOn), active: speakerOn },
            { icon: Plus, label: 'add call', disabled: true },
            { icon: Video, label: 'FaceTime', disabled: true },
            { icon: Users, label: 'contacts', disabled: true },
          ].map((btn, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <button 
                onClick={btn.action}
                disabled={btn.disabled}
                className={`w-16 h-16 flex items-center justify-center rounded-full transition-all border
                  ${btn.active ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-white/5 border-white/10 text-[#D4AF37]'}
                  ${btn.disabled ? 'opacity-20 grayscale' : 'active:bg-white/20'}`}
              >
                <btn.icon size={28} />
              </button>
              <span className={`text-[10px] uppercase tracking-widest ${btn.disabled ? 'opacity-20' : 'opacity-60'}`}>
                {btn.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {transcript && (
        <div className="absolute top-1/2 left-0 w-full text-center px-8 -translate-y-48 pointer-events-none">
           <div className="bg-black/80 backdrop-blur-sm border border-[#D4AF37]/20 p-3 text-[10px] leading-relaxed inline-block mx-auto max-w-full">
              {transcript}
           </div>
        </div>
      )}

      <div className="pb-16 flex justify-center">
        <button onClick={endCall} className="w-20 h-20 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-95 transition-transform shadow-[0_0_30px_rgba(255,59,48,0.2)]">
          <PhoneOff size={32} fill="currentColor" className="rotate-[135deg]" />
        </button>
      </div>
      <audio ref={remoteAudioRef} autoPlay playsInline />
    </div>
  );
}