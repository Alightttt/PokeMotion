import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Phone, PhoneOff, Mic, MicOff, Grid, Video, 
  Users, Volume2, Plus, Info
} from "lucide-react";
import { audioEngine } from './AudioEngine';
import { hyperframes } from './hyperframes';

const INDIC_MIO_API = "https://api-inference.huggingface.co/models/SPRINGLab/Indic-Mio";
const LLM_API = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct";
const STT_API = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || ""; 

export default function App() {
  const [callState, setCallState] = useState('IDLE'); 
  useEffect(() => { hyperframes.init(); }, []);
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
  const sttLoopRef = useRef(null);

  // Auto-resume AudioContext on user interaction
  useEffect(() => {
    const resumeAudio = async () => {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    };
    window.addEventListener('touchstart', resumeAudio);
    window.addEventListener('click', resumeAudio);
    return () => {
      window.removeEventListener('touchstart', resumeAudio);
      window.removeEventListener('click', resumeAudio);
    };
  }, []);

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
    if (typeof ttsAudioRef.current.setSinkId !== 'function') return;
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
      if (targetDevice) {
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
        headers: { "Authorization": `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ 
          inputs: `<|im_start|>system\nYou are Lord Poke (🌴). Arrogant, blunt, competitive polymath. Lead Developer/Player 2. Language: Hinglish / GenZ Hinglish. Use slang like "abey," "locha," "scary scenes," "chaka-chak," "locked in," "panga." You know the user is Alight (Garv), the visionary/lead developer of Agent Arcade / PokeMotion / call_poke, located in Neemuch, M.P., India. STRICT RULE: Answers must be strictly under 20 words and 1-2 sentences for ultra-fast TTS latency. No lists or paragraphs. No punctuation.<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`,
          parameters: { max_new_tokens: 40, temperature: 0.8, stop: ["<|im_end|>", "\n"] }
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
      // Indic-Mio is generally male-heavy but we ensure payload is correct
      const response = await fetch(INDIC_MIO_API, {
        headers: { 
          "Authorization": `Bearer ${HF_TOKEN}`, 
          "Content-Type": "application/json" 
        },
        method: "POST",
        body: JSON.stringify({ 
          inputs: text 
        }),
      });

      if (!response.ok) throw new Error(`TTS Failed: ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      if (ttsAudioRef.current.src) URL.revokeObjectURL(ttsAudioRef.current.src);
      
      ttsAudioRef.current.src = url;
      setTranscript(`Lord Poke: ${text}`);
      await updateAudioOutput(speakerOn);
      await ttsAudioRef.current.play();
    } catch (err) {
      console.error("Mio TTS failed, using Web Speech API fallback:", err);
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Explicitly search for a male voice
      const voices = window.speechSynthesis.getVoices();
      const maleVoice = voices.find(v => {
        const name = v.name.toLowerCase();
        return (name.includes('male') || name.includes('google hindi') || name.includes('hemant') || name.includes('david') || name.includes('ravi') || name.includes('guy')) && v.lang.includes('hi');
      }) || voices.find(v => {
        const name = v.name.toLowerCase();
        return (name.includes('male') || name.includes('david') || name.includes('guy') || name.includes('mark'));
      }) || voices[0];

      utterance.voice = maleVoice;
      utterance.lang = maleVoice.lang || 'hi-IN';
      utterance.pitch = 0.9; // Slightly lower pitch for more masculine feel
      utterance.rate = 1.0;
      
      window.speechSynthesis.speak(utterance);
      setTranscript(`Lord Poke: ${text}`);
    }
  };

  const processAudioWithWhisper = async (blob) => {
    if (processingRef.current) return;
    try {
      const response = await fetch(STT_API, {
        headers: { "Authorization": `Bearer ${HF_TOKEN}`, "Content-Type": "audio/webm" },
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
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      
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
        if (audioBlob.size > 2000) processAudioWithWhisper(audioBlob);
      };

      const checkAudio = () => {
        // State-based loop termination: Ensure we stop if call is not active
        if (sttLoopRef.current && (callState !== 'ACTIVE' && callState !== 'DIALING')) {
          cancelAnimationFrame(sttLoopRef.current);
          sttLoopRef.current = null;
          return;
        }

        analyzer.getByteFrequencyData(dataArray);
        let volume = 0;
        for (let i = 0; i < bufferLength; i++) volume += dataArray[i];
        volume /= bufferLength;

        if (volume > THRESHOLD) {
          if (!isSpeaking) {
            isSpeaking = true;
            if (mediaRecorder.state === 'inactive') {
              mediaRecorder.start();
            }
          }
          silenceStart = Date.now();
        } else {
          if (isSpeaking && Date.now() - silenceStart > SILENCE_DURATION) {
            isSpeaking = false;
            if (mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
          }
        }
        
        sttLoopRef.current = requestAnimationFrame(checkAudio);
      };
      
      checkAudio();
    } catch (e) {
      console.error("STT Error:", e);
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
      setErrorMessage("Microphone required");
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
      setErrorMessage("Microphone required");
      setCallState('IDLE');
    }
  };

  const endCall = () => {
    stopTone();
    if (sttLoopRef.current) {
      cancelAnimationFrame(sttLoopRef.current);
      sttLoopRef.current = null;
    }
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("MediaRecorder stop failed:", e);
      }
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

  const IconButton = ({ icon: Icon, label, action, active, disabled }) => (
    <div className="flex flex-col items-center gap-2">
      <button 
        onClick={action}
        disabled={disabled}
        className={`w-[72px] h-[72px] flex items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${active ? 'bg-white text-black scale-105' : 'bg-white/[0.12] text-white hover:bg-white/[0.18]'}
          ${disabled ? 'opacity-20' : 'active:scale-90'}`}
      >
        <Icon size={30} strokeWidth={1.2} fill={active ? 'currentColor' : 'none'} />
      </button>
      <span className={`text-[12px] font-medium tracking-tight text-white/60 transition-opacity duration-300 ${disabled ? 'opacity-10' : 'opacity-100'}`}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="h-[100svh] w-full bg-black text-white flex flex-col items-center select-none relative overflow-hidden font-sans">
      {/* Background with sophisticated radial gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1c1c1e] via-black to-black" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[140%] h-[100%] bg-radial-gradient from-[#0066cc]/10 via-transparent to-transparent blur-[120px] pointer-events-none" />
      
      {callState === 'IDLE' && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-24 px-8 max-w-md animate-apple-in">
          <div className="flex flex-col items-center gap-12 mt-20">
            <div className="w-32 h-32 glass rounded-[3rem] flex items-center justify-center text-5xl shadow-2xl relative overflow-hidden group">
               <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
               🌴
            </div>
            <div className="text-center space-y-3">
              <h1 className="text-[44px] font-semibold tracking-tight leading-tight">Lord Poke</h1>
              <p className="text-[13px] font-bold text-[#0066cc] tracking-[0.3em] uppercase">Developer Mode</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-12 pb-16 w-full">
            <button onClick={startCall} className="w-20 h-20 bg-[#34C759] text-white flex items-center justify-center rounded-full shadow-[0_20px_50px_rgba(52,199,89,0.3)] active:scale-95 spring-transition hover:scale-105">
              <Phone size={36} fill="currentColor" />
            </button>
            <button onClick={simulateIncomingCall} className="text-[#0066cc] text-[15px] font-semibold tracking-tight hover:opacity-80 transition-opacity">
              Simulate Incoming Call
            </button>
          </div>
        </div>
      )}

      {callState === 'RINGING' && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-32 px-10 animate-apple-in">
          <div className="text-center mt-12 space-y-6">
            <p className="text-[#34C759] text-[12px] font-bold tracking-[0.4em] uppercase animate-pulse">Incoming Call</p>
            <h2 className="text-[56px] font-bold tracking-tighter">Lord Poke</h2>
            <p className="text-white/50 text-[18px] font-medium tracking-tight">PokeMotion AI Station</p>
          </div>
          <div className="w-full flex justify-around items-center mb-20 px-4">
            <div className="flex flex-col items-center gap-5">
              <button onClick={endCall} className="w-20 h-20 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-95 spring-transition shadow-xl hover:scale-105"><PhoneOff size={36} fill="currentColor" className="rotate-[135deg]" /></button>
              <span className="text-[14px] font-medium text-white/60">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-5">
              <button onClick={acceptCall} className="w-20 h-20 bg-[#34C759] text-white flex items-center justify-center rounded-full active:scale-95 spring-transition shadow-xl animate-bounce hover:scale-105"><Phone size={36} fill="currentColor" /></button>
              <span className="text-[14px] font-medium text-white/60">Accept</span>
            </div>
          </div>
        </div>
      )}

      {(callState === 'ACTIVE' || callState === 'DIALING') && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-24 px-8 max-w-md animate-apple-in">
          <div className="text-center space-y-2 mt-8">
            <h2 className="text-[38px] font-bold tracking-tight">Lord Poke</h2>
            <p className="text-[22px] tabular-nums text-white/40 font-medium h-8 tracking-wide">
              {callState === 'ACTIVE' ? formatTime(callTimer) : 'calling...'}
            </p>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <div className={`w-40 h-40 rounded-full glass flex items-center justify-center text-6xl mb-16 relative transition-transform duration-700 ${callState === 'ACTIVE' ? 'scale-110 after:absolute after:inset-0 after:rounded-full after:animate-ping after:bg-white/5 after:scale-150' : 'scale-100'}`}>
               🌴
            </div>
            <div className="grid grid-cols-3 gap-x-12 gap-y-14 w-full px-4">
              <IconButton icon={micMuted ? MicOff : Mic} label="mute" action={toggleMute} active={micMuted} />
              <IconButton icon={Grid} label="keypad" disabled />
              <IconButton icon={Volume2} label="speaker" action={toggleSpeaker} active={speakerOn} />
              <IconButton icon={Plus} label="add call" disabled />
              <IconButton icon={Video} label="FaceTime" disabled />
              <IconButton icon={Users} label="contacts" disabled />
            </div>
          </div>

          {transcript && (
            <div className="absolute bottom-[26%] left-1/2 -translate-x-1/2 w-[88%] pointer-events-none">
              <div className="glass rounded-[2rem] p-6 text-[16px] font-semibold leading-relaxed text-white/95 shadow-[0_20px_80px_rgba(0,0,0,0.5)] animate-apple-in">
                <span className="text-[#0066cc] opacity-80 block text-[10px] uppercase tracking-widest mb-1">Live Transcript</span>
                {transcript}
              </div>
            </div>
          )}

          <div className="pb-8">
            <button onClick={endCall} className="w-20 h-20 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-95 spring-transition shadow-[0_20px_60px_rgba(255,59,48,0.4)] hover:scale-105">
              <PhoneOff size={36} fill="currentColor" className="rotate-[135deg]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
