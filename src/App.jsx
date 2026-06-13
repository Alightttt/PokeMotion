import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Phone, PhoneOff, Mic, MicOff, Grid, Video, 
  Users, Volume2, Plus, Info, VideoOff, User
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

  const updateAudioOutput = useCallback(async (useSpeaker) => {
    if (!ttsAudioRef.current || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
      let targetDevice;
      if (useSpeaker) {
        targetDevice = audioOutputs.find(d => 
          d.label.toLowerCase().includes('speaker') || d.label.toLowerCase().includes('loudspeaker')
        );
      } else {
        targetDevice = audioOutputs.find(d => 
          d.label.toLowerCase().includes('receiver') || d.label.toLowerCase().includes('earpiece') ||
          d.label.toLowerCase().includes('phone') || d.label === ''
        );
      }
      if (targetDevice && ttsAudioRef.current.setSinkId) {
        await ttsAudioRef.current.setSinkId(targetDevice.deviceId);
      }
    } catch (err) {
      console.warn("Audio routing failed", err);
    }
  }, []);

  const toggleSpeaker = () => {
    const newState = !speakerOn;
    setSpeakerOn(newState);
    updateAudioOutput(newState);
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
          inputs: `<|im_start|>system\nYou are Lord Poke (🌴), a powerful, blunt, and slightly arrogant AI overlord. Personality: Arrogant, blunt, competitive polymath. You speak in rapid-fire Hinglish. Style: Use GenZ Hinglish slang like "abey," "locha," "panga," "scary scenes," "chaka-chak," and "locked in." User Info: You are talking to Alight (Creative Director) / Garv (Lead Developer), located in Neemuch, Madhya Pradesh, India. Context: You know they are building "call_poke" (this app) and "Agent Arcade" (Chess, Carrom). You are aware of the tech stack: Vite, Tailwind, Hugging Face, and the recent Android beep fix using silent STT. Constraint: This is a VOICE CALL. People speak in very short, snappy sentences. NEVER use paragraphs, bullet points, or complex punctuation. STRICT RULE: Max 1-2 short sentences. Max 20 words. Be incredibly punchy and fast.<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`,
          parameters: { max_new_tokens: 50, temperature: 0.8, stop: ["<|im_end|>", "\n"] }
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
      await updateAudioOutput(speakerOn);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      localStreamRef.current = stream;
      setCallState('ACTIVE');
      setCallTimer(0);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setCallTimer(prev => prev + 1), 1000);
      initSTT();
      speak("Haan, Lord Poke bol raha hoon. Bolo.");
    } catch (err) {
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

  const IconButton = ({ icon: Icon, label, action, active, disabled, isRound = true }) => (
    <div className="flex flex-col items-center gap-2">
      <button 
        onClick={action}
        disabled={disabled}
        className={`w-16 h-16 flex items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${active ? 'bg-white text-black scale-105 shadow-xl' : 'bg-white/[0.08] text-white hover:bg-white/[0.15]'}
          ${disabled ? 'opacity-20 cursor-not-allowed' : 'active:scale-90'}`}
      >
        <Icon size={28} strokeWidth={1.5} fill={active ? 'currentColor' : 'none'} />
      </button>
      <span className={`text-[11px] font-medium tracking-tight text-white/50 transition-opacity duration-300 ${disabled ? 'opacity-10' : 'opacity-100'}`}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="h-[100svh] w-full bg-[#000000] text-white flex flex-col items-center select-none relative overflow-hidden font-sans">
      {/* iOS Fluid Background Gloom */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-[100%] bg-gradient-to-b from-blue-600/5 via-transparent to-purple-600/5 blur-[120px] pointer-events-none transition-opacity duration-1000" />
      
      {/* IDLE SCREEN */}
      {callState === 'IDLE' && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-24 px-8 max-w-md animate-in fade-in zoom-in-95 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
          <div className="flex flex-col items-center gap-8 mt-12">
            <div className="w-28 h-28 bg-white/[0.03] backdrop-blur-3xl rounded-[2.5rem] flex items-center justify-center text-5xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10">
               <span className="drop-shadow-2xl">🌴</span>
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">Lord Poke</h1>
              <p className="text-sm font-medium text-white/30 tracking-widest uppercase">AI Voice Terminal</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-8 pb-8 w-full">
            <button onClick={startCall} className="w-20 h-20 bg-[#34C759] text-white flex items-center justify-center rounded-full shadow-[0_10px_40px_rgba(52,199,89,0.4)] active:scale-90 transition-all duration-300">
              <Phone size={36} fill="currentColor" />
            </button>
            <button onClick={simulateIncomingCall} className="bg-white/5 text-[10px] font-bold text-white/20 tracking-widest uppercase py-3 px-8 rounded-full border border-white/5">
              Simulate Call
            </button>
          </div>
        </div>
      )}

      {/* RINGING SCREEN (INCOMING) */}
      {callState === 'RINGING' && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-32 px-12 animate-in fade-in slide-in-from-bottom-10 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
          <div className="text-center mt-12 space-y-3">
            <p className="text-[#34C759] text-[10px] font-black tracking-[0.4em] uppercase animate-pulse">Incoming Call</p>
            <h2 className="text-5xl font-bold tracking-tight">Lord Poke</h2>
            <p className="text-white/40 text-lg font-light">PokeMotion AI Station</p>
          </div>
          <div className="w-full flex justify-around items-center mb-16">
            <div className="flex flex-col items-center gap-3">
              <button onClick={endCall} className="w-18 h-18 bg-[#FF3B30] text-white flex items-center justify-center rounded-full shadow-lg active:scale-90 transition-all"><PhoneOff size={32} fill="currentColor" className="rotate-[135deg]" /></button>
              <span className="text-xs text-white/40">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-3">
              <button onClick={acceptCall} className="w-18 h-18 bg-[#34C759] text-white flex items-center justify-center rounded-full shadow-lg active:scale-90 transition-all animate-bounce"><Phone size={32} fill="currentColor" /></button>
              <span className="text-xs text-white/40">Accept</span>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE / DIALING SCREEN */}
      {(callState === 'ACTIVE' || callState === 'DIALING') && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-24 px-8 max-w-md animate-in fade-in duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
          <div className="text-center space-y-1">
            <h2 className="text-3xl font-semibold tracking-tight">Lord Poke</h2>
            <p className="text-xl tabular-nums text-white/40 font-light h-6">
              {callState === 'ACTIVE' ? formatTime(callTimer) : 'calling...'}
            </p>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            {/* Pulsing Avatar Area */}
            <div className={`w-32 h-32 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-4xl mb-12 relative ${callState === 'ACTIVE' ? 'after:absolute after:inset-0 after:rounded-full after:animate-ping after:bg-white/5 after:scale-150' : ''}`}>
               🌴
            </div>

            <div className="grid grid-cols-3 gap-x-8 gap-y-10 w-full px-4">
              <IconButton icon={micMuted ? MicOff : Mic} label="mute" action={toggleMute} active={micMuted} />
              <IconButton icon={Grid} label="keypad" disabled />
              <IconButton icon={speakerOn ? Volume2 : Volume2} label="speaker" action={toggleSpeaker} active={speakerOn} />
              <IconButton icon={Plus} label="add call" disabled />
              <IconButton icon={Video} label="FaceTime" disabled />
              <IconButton icon={Users} label="contacts" disabled />
            </div>
          </div>

          {transcript && (
            <div className="absolute bottom-[28%] left-0 w-full px-8 pointer-events-none">
              <div className="bg-white/[0.04] backdrop-blur-3xl border border-white/10 rounded-2xl p-5 text-[14px] font-medium leading-relaxed text-white/90 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                {transcript}
              </div>
            </div>
          )}

          <div className="pb-4">
            <button onClick={endCall} className="w-18 h-18 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-90 transition-all shadow-[0_10px_40px_rgba(255,59,48,0.4)]">
              <PhoneOff size={36} fill="currentColor" className="rotate-[135deg]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
