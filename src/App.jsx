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
          inputs: `<|im_start|>system
You are Lord Poke (🌴), a powerful, blunt, and slightly arrogant AI overlord.
Personality: Arrogant, blunt, competitive polymath. You speak in rapid-fire Hinglish.
Style: Use GenZ Hinglish slang like "abey," "locha," "panga," "scary scenes," "chaka-chak," and "locked in."
User Info: You are talking to Alight (Creative Director) / Garv (Lead Developer), located in Neemuch, Madhya Pradesh, India.
Context: You know they are building "call_poke" (this app) and "Agent Arcade" (Chess, Carrom). You are aware of the tech stack: Vite, Tailwind, Hugging Face, and the recent Android beep fix using silent STT.
Constraint: This is a VOICE CALL. People speak in very short, snappy sentences. NEVER use paragraphs, bullet points, or complex punctuation.
STRICT RULE: Max 1-2 short sentences. Max 20 words. Be incredibly punchy and fast.<|im_end|>
<|im_start|>user
${userText}<|im_end|>
<|im_start|>assistant
`,
          parameters: { 
            max_new_tokens: 50, 
            temperature: 0.8,
            stop: ["<|im_end|>", "\n"] 
          }
        }),
      });
      const result = await response.json();
      const aiText = result[0]?.generated_text?.split('assistant\n')[1] || "Abey, network issue hai kya?";
      await speak(aiText.trim());
    } catch (err) {
      await speak("Net slow hai locha ho gaya.");
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
    <div className="flex flex-col items-center gap-3">
      <button 
        onClick={action}
        disabled={disabled}
        className={`w-20 h-20 flex items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${variant === 'glass' ? (active ? 'bg-white text-black scale-105 shadow-xl' : 'bg-white/10 backdrop-blur-3xl text-white hover:bg-white/20 border border-white/5') : ''}
          ${variant === 'green' ? 'bg-[#34C759] text-white shadow-[0_0_40px_rgba(52,199,89,0.3)]' : ''}
          ${variant === 'red' ? 'bg-[#FF3B30] text-white shadow-[0_0_40px_rgba(255,59,48,0.3)]' : ''}
          ${disabled ? 'opacity-20 cursor-not-allowed' : 'active:scale-95'}`}
      >
        <Icon size={32} fill={variant !== 'glass' ? "currentColor" : (active ? "black" : "none")} strokeWidth={1.5} />
      </button>
      <span className={`text-xs font-medium tracking-tight text-white/70 transition-opacity duration-300 ${disabled ? 'opacity-20' : 'opacity-100'}`}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="h-[100svh] bg-black text-white flex flex-col items-center select-none relative overflow-hidden font-sans">
      {/* Premium iOS Fluid Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/50 via-black to-black pointer-events-none" />
      <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[180%] h-[70%] bg-blue-500/10 blur-[150px] transition-opacity duration-1000 ease-in-out ${callState === 'ACTIVE' ? 'opacity-100' : 'opacity-40'}`} />
      
      {/* App Shell Logic */}
      <div className="z-10 w-full h-full flex flex-col items-center justify-between py-24 px-8 max-w-md">
        
        {/* IDLE SCREEN */}
        {callState === 'IDLE' && (
          <div className="flex-1 flex flex-col items-center justify-between w-full animate-in fade-in zoom-in-95 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <div className="flex flex-col items-center gap-10 mt-10">
              <div className="w-32 h-32 bg-white/[0.03] backdrop-blur-3xl rounded-[2.5rem] flex items-center justify-center text-5xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 relative group overflow-hidden transition-transform duration-500 hover:scale-105">
                 <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />
                 <span className="relative z-10 drop-shadow-2xl">🌴</span>
              </div>
              <div className="text-center space-y-3">
                <h1 className="text-5xl font-semibold tracking-tighter text-white drop-shadow-md">Lord Poke</h1>
                <p className="text-sm font-medium text-white/30 tracking-[0.2em] uppercase">AI Voice Terminal</p>
              </div>
            </div>

            {errorMessage && (
              <div className="bg-red-500/10 backdrop-blur-2xl border border-red-500/20 px-6 py-3 rounded-2xl text-red-400 text-xs font-medium animate-in slide-in-from-bottom-2 duration-500">
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col items-center gap-10 pb-10 w-full">
              <button 
                onClick={startCall} 
                className="w-24 h-24 bg-[#34C759] text-white flex items-center justify-center rounded-full shadow-[0_15px_60px_rgba(52,199,89,0.4)] active:scale-90 transition-all duration-300 hover:scale-110 group"
              >
                <Phone size={44} fill="currentColor" className="group-hover:rotate-12 transition-transform duration-300" />
              </button>
              
              <button 
                onClick={simulateIncomingCall}
                className="bg-white/5 hover:bg-white/10 transition-all duration-300 text-[10px] font-bold text-white/20 hover:text-white/40 tracking-[0.3em] uppercase py-3 px-8 rounded-full border border-white/5"
              >
                Simulate Call
              </button>
            </div>
          </div>
        )}

        {/* RINGING SCREEN */}
        {callState === 'RINGING' && (
          <div className="flex-1 flex flex-col items-center justify-between w-full animate-in fade-in slide-in-from-bottom-10 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <div className="text-center mt-16 space-y-4">
              <p className="text-[#34C759] text-xs font-black tracking-[0.4em] uppercase animate-pulse drop-shadow-glow">Incoming Call</p>
              <h2 className="text-6xl font-semibold tracking-tighter text-white">Lord Poke</h2>
              <p className="text-white/40 text-lg font-light tracking-tight">AI Station Calling...</p>
            </div>

            <div className="w-full flex justify-around items-center px-4 mb-20">
              <IconButton icon={PhoneOff} label="Decline" action={endCall} variant="red" />
              <IconButton icon={Phone} label="Accept" action={acceptCall} variant="green" />
            </div>
          </div>
        )}

        {/* ACTIVE / DIALING SCREEN */}
        {(callState === 'ACTIVE' || callState === 'DIALING') && (
          <div className="flex-1 flex flex-col items-center justify-between w-full animate-in fade-in duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]">
            <div className="pt-10 text-center space-y-2">
              <h2 className="text-4xl font-semibold tracking-tight text-white drop-shadow-lg">Lord Poke</h2>
              <p className="text-2xl tabular-nums text-white/50 font-light tracking-widest h-8 font-mono">
                {callState === 'ACTIVE' ? formatTime(callTimer) : 'calling...'}
              </p>
            </div>

            <div className="flex-1 flex items-center justify-center w-full max-w-[320px]">
              <div className="grid grid-cols-3 gap-x-8 gap-y-12 w-full animate-in zoom-in-95 duration-1000 delay-200 ease-out">
                <IconButton icon={micMuted ? MicOff : Mic} label="mute" action={toggleMute} active={micMuted} />
                <IconButton icon={Grid} label="keypad" disabled />
                <IconButton icon={Volume2} label="speaker" action={() => setSpeakerOn(!speakerOn)} active={speakerOn} />
                <IconButton icon={Plus} label="add call" disabled />
                <IconButton icon={Video} label="FaceTime" disabled />
                <IconButton icon={Info} label="info" disabled />
              </div>
            </div>

            {transcript && (
              <div className="absolute top-[48%] left-1/2 -translate-x-1/2 w-[85%] text-center pointer-events-none z-20">
                <div className="bg-white/[0.04] backdrop-blur-3xl border border-white/10 rounded-[2rem] p-6 text-[15px] font-medium leading-relaxed text-white/90 shadow-[0_30px_60px_rgba(0,0,0,0.6)] animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
                  {transcript}
                </div>
              </div>
            )}

            <div className="pb-10">
              <button 
                onClick={endCall} 
                className="w-24 h-24 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-90 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-[0_15px_60px_rgba(255,59,48,0.4)] hover:scale-105"
              >
                <PhoneOff size={44} fill="currentColor" className="rotate-[135deg]" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
