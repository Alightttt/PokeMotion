import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Phone, PhoneOff, Mic, MicOff, Grid, Video, 
  Users, Volume2, Plus, Info
} from "lucide-react";
import { audioEngine } from './AudioEngine';

const INDIC_MIO_API = "https://api-inference.huggingface.co/models/SPRINGLab/Indic-Mio";
const LLM_API = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct";
const STT_API = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || ""; 

export default function App() {
  const [callState, setCallState] = useState('IDLE'); // IDLE, DIALING, RINGING, ACTIVE
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  
  const localStreamRef = useRef(null);
  const audioCleanupRef = useRef(null);
  const ttsAudioRef = useRef(new Audio());
  const timerRef = useRef(null);
  const processingRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);

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
      if (!response.ok) throw new Error("TTS API Failed");
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

  const processAudioWithWhisper = async (blob) => {
    if (processingRef.current) return;
    try {
      const response = await fetch(STT_API, {
        headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "audio/webm" } : { "Content-Type": "audio/webm" },
        method: "POST",
        body: blob,
      });
      const result = await response.json();
      if (result.text && result.text.trim().length > 1) {
        getLordPokeResponse(result.text);
      }
    } catch (err) {
      console.error("Whisper error:", err);
    }
  };

  const initSTT = useCallback(() => {
    if (!localStreamRef.current) return;

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(localStreamRef.current);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let isSpeaking = false;
      let silenceStart = Date.now();
      const THRESHOLD = 35; 
      const SILENCE_DURATION = 1500; 

      const mediaRecorder = new MediaRecorder(localStreamRef.current);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        if (audioBlob.size > 2000) { 
           processAudioWithWhisper(audioBlob);
        }
      };

      const checkAudio = () => {
        if (callState !== 'ACTIVE') return;
        analyzer.getByteFrequencyData(dataArray);
        let volume = 0;
        for (let i = 0; i < bufferLength; i++) volume += dataArray[i];
        volume /= bufferLength;

        if (volume > THRESHOLD) {
          if (!isSpeaking) {
            isSpeaking = true;
            if (mediaRecorder.state === 'inactive') mediaRecorder.start();
          }
          silenceStart = Date.now();
        } else {
          if (isSpeaking && Date.now() - silenceStart > SILENCE_DURATION) {
            isSpeaking = false;
            if (mediaRecorder.state === 'recording') mediaRecorder.stop();
          }
        }
        if (callState === 'ACTIVE') {
          requestAnimationFrame(checkAudio);
        }
      };

      checkAudio();
    } catch (e) {
      console.error("STT Init Error:", e);
    }
  }, [callState]);

  const startCall = async () => {
    try {
      audioEngine.init();
      setCallState('DIALING');
      setErrorMessage('');
      audioCleanupRef.current = audioEngine.playDialTone();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      setTimeout(() => {
        stopTone();
        setCallState('ACTIVE');
        setCallTimer(0);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => setCallTimer(prev => prev + 1), 1000);
        
        initSTT();
        speak("Haan, Lord Poke bol raha hoon. Bolo.");
      }, 3000);

    } catch (err) {
      console.error("Start call error:", err);
      setErrorMessage("Microphone access required.");
      setCallState('IDLE');
    }
  };

  const simulateIncomingCall = () => {
    audioEngine.init();
    setCallState('RINGING');
    setErrorMessage('');
    audioCleanupRef.current = audioEngine.playRingTone();
  };

  const acceptCall = async () => {
    stopTone();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setCallState('ACTIVE');
      setCallTimer(0);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setCallTimer(prev => prev + 1), 1000);
      initSTT();
      speak("Haan, Lord Poke bol raha hoon. Bolo.");
    } catch (err) {
      console.error("Accept call error:", err);
      setErrorMessage("Microphone access required.");
      setCallState('IDLE');
    }
  };

  const endCall = () => {
    stopTone();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

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

  const IconButton = ({ icon: Icon, label, action, active, disabled, variant = 'glass' }) => (
    <div className="flex flex-col items-center gap-2">
      <button 
        onClick={action}
        disabled={disabled}
        className={`w-[4.5rem] h-[4.5rem] flex items-center justify-center rounded-full transition-all duration-300
          ${variant === 'glass' ? (active ? 'bg-white text-black' : 'bg-white/10 backdrop-blur-xl text-white hover:bg-white/20 border border-white/5') : ''}
          ${variant === 'green' ? 'bg-[#34C759] text-white' : ''}
          ${variant === 'red' ? 'bg-[#FF3B30] text-white' : ''}
          ${disabled ? 'opacity-30' : 'active:scale-90'}`}
      >
        <Icon size={28} fill={variant !== 'glass' ? "currentColor" : (active ? "black" : "none")} />
      </button>
      <span className={`text-[11px] font-medium text-white/90 transition-opacity ${disabled ? 'opacity-30' : 'opacity-100'}`}>
        {label}
      </span>
    </div>
  );

  if (callState === 'IDLE') {
    return (
      <div className="h-[100svh] bg-black text-white flex flex-col items-center justify-between py-24 px-8 select-none font-sans">
        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-1000 slide-in-from-top-10">
          <div className="w-24 h-24 bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl flex items-center justify-center text-4xl shadow-2xl border border-white/10 overflow-hidden relative">
             <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
             <span className="relative z-10">🌴</span>
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-white mb-2">Lord Poke</h1>
            <p className="text-sm text-white/40 tracking-wider uppercase">AI Voice Terminal</p>
          </div>
        </div>

        {errorMessage && (
           <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-2xl text-red-400 text-[11px] animate-pulse">
             {errorMessage}
           </div>
        )}

        <div className="w-full max-w-xs flex flex-col items-center gap-8 pb-12">
          <button 
            onClick={startCall} 
            className="w-24 h-24 bg-[#34C759] text-white flex items-center justify-center rounded-full shadow-[0_0_50px_rgba(52,199,89,0.4)] active:scale-90 transition-all hover:scale-105"
          >
            <Phone size={40} fill="currentColor" />
          </button>
          
          <button 
            onClick={simulateIncomingCall}
            className="text-white/20 hover:text-white/40 transition-colors text-xs font-mono tracking-widest uppercase py-2 px-4 border border-white/5 rounded-full"
          >
            Simulate Incoming
          </button>
        </div>
      </div>
    );
  }

  if (callState === 'RINGING') {
    return (
      <div className="h-[100svh] bg-black text-white flex flex-col items-center justify-between py-32 px-12 select-none font-sans animate-in fade-in duration-500">
        <div className="text-center">
          <p className="text-[#34C759] text-xs font-mono uppercase tracking-[0.3em] mb-4 animate-pulse">Incoming Call</p>
          <h2 className="text-5xl font-semibold tracking-tight text-white mb-2">Lord Poke</h2>
          <p className="text-white/40 text-sm font-light">PokeMotion AI Station</p>
        </div>

        <div className="w-full flex justify-between items-center max-w-[320px] mb-12">
          <IconButton icon={PhoneOff} label="Decline" action={endCall} variant="red" />
          <IconButton icon={Phone} label="Accept" action={acceptCall} variant="green" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100svh] bg-black text-white flex flex-col select-none relative overflow-hidden font-sans">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-[60%] bg-gradient-to-b from-blue-500/10 to-transparent blur-[140px] pointer-events-none" />

      <div className="pt-24 text-center z-10 animate-in fade-in slide-in-from-top-5 duration-700">
        <h2 className="text-4xl font-semibold tracking-tight text-white mb-2">Lord Poke</h2>
        <p className="text-xl tabular-nums text-white/60 font-light h-8 tracking-wider">
          {callState === 'ACTIVE' ? formatTime(callTimer) : (callState === 'DIALING' ? 'calling...' : '')}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center z-10 px-8">
        <div className="w-full grid grid-cols-3 gap-y-14 max-w-[320px]">
          <IconButton icon={micMuted ? MicOff : Mic} label="mute" action={toggleMute} active={micMuted} />
          <IconButton icon={Grid} label="keypad" disabled />
          <IconButton icon={Volume2} label="speaker" action={() => setSpeakerOn(!speakerOn)} active={speakerOn} />
          <IconButton icon={Plus} label="add call" disabled />
          <IconButton icon={Video} label="FaceTime" disabled />
          <IconButton icon={Info} label="info" disabled />
        </div>
      </div>

      {transcript && (
        <div className="absolute top-[48%] left-0 w-full text-center px-12 pointer-events-none z-20 transition-all duration-500 animate-in fade-in slide-in-from-bottom-6">
           <div className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-3xl p-5 text-[14px] font-medium leading-relaxed text-white/90 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              {transcript}
           </div>
        </div>
      )}

      <div className="pb-24 flex justify-center z-10">
        <button 
          onClick={endCall} 
          className="w-24 h-24 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-90 transition-all shadow-[0_0_50px_rgba(255,59,48,0.4)] hover:scale-105"
        >
          <PhoneOff size={40} fill="currentColor" className="rotate-[135deg]" />
        </button>
      </div>
    </div>
  );
}
