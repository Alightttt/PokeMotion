import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Phone, PhoneOff, Mic, MicOff, Grid, Video, 
  Users, Volume2, Plus, Send
} from "lucide-react";
import { audioEngine } from './AudioEngine';

const INDIC_MIO_API = "https://api-inference.huggingface.co/models/SPRINGLab/Indic-Mio";
const LLM_API = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct";
const STT_API = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || ""; 

export default function App() {
  const [callState, setCallState] = useState('IDLE'); 
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
        if (callState !== 'ACTIVE' && callState !== 'CONNECTED') return;
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
        if (callState === 'ACTIVE' || callState === 'CONNECTED') {
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

      // Simulate a short connection delay for the dial tone feel
      setTimeout(() => {
        stopTone();
        setCallState('ACTIVE');
        setCallTimer(0);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => setCallTimer(prev => prev + 1), 1000);
        
        initSTT();
        speak("Haan, Lord Poke bol raha hoon. Bolo.");
      }, 2000);

    } catch (err) {
      console.error("Start call error:", err);
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
        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-700">
          <div className="w-24 h-24 bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl flex items-center justify-center text-4xl shadow-2xl border border-white/10 overflow-hidden relative">
             <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
             <span className="relative z-10">🌴</span>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Lord Poke</h1>
            <p className="text-sm text-white/40 mt-1">PokeMotion AI Terminal</p>
          </div>
        </div>

        {errorMessage && (
           <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-2xl text-red-400 text-[10px] animate-pulse">
             {errorMessage}
           </div>
        )}

        <div className="w-full max-w-xs flex justify-center pb-8">
          <button 
            onClick={startCall} 
            className="w-20 h-20 bg-[#34C759] text-white flex items-center justify-center rounded-full shadow-[0_0_40px_rgba(52,199,89,0.3)] active:scale-95 transition-transform"
          >
            <Phone size={36} fill="currentColor" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100svh] bg-black text-white flex flex-col select-none relative overflow-hidden font-sans">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-[50%] bg-gradient-to-b from-blue-500/10 to-transparent blur-[120px] pointer-events-none" />

      <div className="pt-24 text-center z-10">
        <h2 className="text-3xl font-semibold tracking-tight mb-1">Lord Poke</h2>
        <p className="text-lg tabular-nums text-white/60 font-light h-8">
          {callState === 'ACTIVE' || callState === 'CONNECTED' ? formatTime(callTimer) : (callState === 'DIALING' ? 'calling...' : '')}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center z-10 px-8">
        <div className="w-full grid grid-cols-3 gap-y-12 max-w-[300px]">
          <IconButton icon={micMuted ? MicOff : Mic} label="mute" action={toggleMute} active={micMuted} />
          <IconButton icon={Grid} label="keypad" disabled />
          <IconButton icon={Volume2} label="speaker" action={() => setSpeakerOn(!speakerOn)} active={speakerOn} />
          <IconButton icon={Plus} label="add call" disabled />
          <IconButton icon={Video} label="FaceTime" disabled />
          <IconButton icon={Users} label="contacts" disabled />
        </div>
      </div>

      {transcript && (
        <div className="absolute top-[45%] left-0 w-full text-center px-10 pointer-events-none z-20 transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
           <div className="bg-white/10 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 text-[13px] font-medium leading-tight text-white/90 shadow-2xl">
              {transcript}
           </div>
        </div>
      )}

      <div className="pb-20 flex justify-center z-10">
        <button 
          onClick={endCall} 
          className="w-20 h-20 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-90 transition-transform shadow-[0_0_40px_rgba(255,59,48,0.3)]"
        >
          <PhoneOff size={36} fill="currentColor" className="rotate-[135deg]" />
        </button>
      </div>
    </div>
  );
}
