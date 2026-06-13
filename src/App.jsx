import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Phone, PhoneOff, Mic, MicOff, Grid, Video, 
  Users, Volume2, Plus, Info
} from "lucide-react";
import { audioEngine } from './AudioEngine';

// Design Tokens (Extracted from Apple Design Analysis)
const TOKENS = {
  colors: {
    primary: "#0066cc", // Action Blue
    primaryOnDark: "#2997ff", // Sky Link Blue
    ink: "#1d1d1f",
    bodyOnDark: "#ffffff",
    surfaceBlack: "#000000",
    surfaceTile1: "#272729",
    surfaceChipTranslucent: "rgba(210, 210, 215, 0.64)",
    glassBg: "rgba(255, 255, 255, 0.04)",
    glassBorder: "rgba(255, 255, 255, 0.08)"
  },
  curves: {
    appleSpring: "cubic-bezier(0.16, 1, 0.3, 1)"
  }
};

const INDIC_MIO_API = "https://api-inference.huggingface.co/models/SPRINGLab/Indic-Mio";
const LLM_API = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct";
const STT_API = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";
// Secret removed for production safety, utilizing environment variable.
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
    if (!ttsAudioRef.current) return;
    try {
      if (ttsAudioRef.current.setSinkId && navigator.mediaDevices.enumerateDevices) {
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
      ttsAudioRef.current.volume = 1.0;
      await ttsAudioRef.current.play();
    } catch (err) {
      console.error("Mio TTS failed:", err);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'hi-IN';
      const voices = window.speechSynthesis.getVoices();
      const maleVoice = voices.find(v => v.lang.includes('hi') && v.name.toLowerCase().includes('male')) || voices.find(v => v.lang.includes('hi')) || voices[0];
      utterance.voice = maleVoice;
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
        if (callState === 'ACTIVE') requestAnimationFrame(checkAudio);
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
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    if (audioContextRef.current) audioContextRef.current.close();
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
        className={`w-[72px] h-[72px] flex items-center justify-center rounded-full transition-all duration-500 active:scale-90
          ${active ? 'bg-white text-black' : 'bg-white/[0.12] text-white hover:bg-white/[0.18]'}
          ${disabled ? 'opacity-20' : ''}`}
        style={{ transitionTimingFunction: TOKENS.curves.appleSpring }}
      >
        <Icon size={30} strokeWidth={1.2} fill={active ? 'currentColor' : 'none'} />
      </button>
      <span className={`text-[12px] font-normal tracking-tight text-white/50 transition-opacity duration-300 ${disabled ? 'opacity-10' : 'opacity-100'}`}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="h-[100svh] w-full bg-[#000000] text-white flex flex-col items-center select-none relative overflow-hidden font-sans">
      <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[200%] h-[140%] bg-[radial-gradient(circle_at_center,rgba(41,151,255,0.08)_0%,transparent_70%)] blur-[100px] pointer-events-none" />
      
      {callState === 'IDLE' && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-24 px-8 max-w-md animate-in fade-in zoom-in-95 duration-700">
          <div className="flex flex-col items-center gap-10 mt-16">
            <div className="w-32 h-32 bg-white/[0.04] backdrop-blur-3xl rounded-[2.5rem] flex items-center justify-center text-5xl border border-white/[0.08] shadow-2xl">
               🌴
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-[40px] font-semibold tracking-tight leading-tight">Lord Poke</h1>
              <p className="text-[12px] font-medium text-white/40 tracking-[0.2em] uppercase">AI Voice Terminal</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-10 pb-12 w-full">
            <button onClick={startCall} className="w-20 h-20 bg-[#34C759] text-white flex items-center justify-center rounded-full shadow-[0_12px_48px_rgba(52,199,89,0.35)] active:scale-90 transition-all duration-300">
              <Phone size={36} fill="currentColor" />
            </button>
            <button onClick={simulateIncomingCall} className="text-[#2997ff] text-[14px] font-medium tracking-tight hover:opacity-70 transition-opacity">
              Simulate Incoming Call
            </button>
          </div>
        </div>
      )}

      {callState === 'RINGING' && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-32 px-10 animate-in fade-in slide-in-from-bottom-12 duration-700">
          <div className="text-center mt-12 space-y-4">
            <p className="text-[#34C759] text-[11px] font-bold tracking-[0.4em] uppercase">Incoming Call</p>
            <h2 className="text-[52px] font-semibold tracking-tight">Lord Poke</h2>
            <p className="text-white/40 text-[17px] font-normal">PokeMotion AI Station</p>
          </div>
          <div className="w-full flex justify-between items-center mb-16 px-4">
            <div className="flex flex-col items-center gap-4">
              <button onClick={endCall} className="w-20 h-20 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-90 transition-all shadow-[0_12px_40px_rgba(255,59,48,0.2)]">
                <PhoneOff size={36} fill="currentColor" className="rotate-[135deg]" />
              </button>
              <span className="text-[14px] text-white/50">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-4">
              <button onClick={acceptCall} className="w-20 h-20 bg-[#34C759] text-white flex items-center justify-center rounded-full active:scale-90 transition-all animate-pulse shadow-[0_12px_40px_rgba(52,199,89,0.2)]">
                <Phone size={36} fill="currentColor" />
              </button>
              <span className="text-[14px] text-white/50">Accept</span>
            </div>
          </div>
        </div>
      )}

      {(callState === 'ACTIVE' || callState === 'DIALING') && (
        <div className="z-10 w-full h-full flex flex-col items-center justify-between py-20 px-8 max-w-md animate-in fade-in duration-1000">
          <div className="text-center space-y-1">
            <h2 className="text-[34px] font-semibold tracking-tight">Lord Poke</h2>
            <p className="text-[20px] tabular-nums text-white/40 font-normal h-8 tracking-wide">
              {callState === 'ACTIVE' ? formatTime(callTimer) : 'calling...'}
            </p>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <div className={`w-32 h-32 md:w-36 md:h-36 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-5xl mb-12 md:mb-16 relative ${callState === 'ACTIVE' ? 'after:absolute after:inset-0 after:rounded-full after:animate-ping after:bg-white/5 after:scale-150' : ''}`}>
               🌴
            </div>

            <div className="grid grid-cols-3 gap-x-8 md:gap-x-10 gap-y-10 md:gap-y-12 w-full px-2">
              <IconButton icon={micMuted ? MicOff : Mic} label="mute" action={toggleMute} active={micMuted} />
              <IconButton icon={Grid} label="keypad" disabled />
              <IconButton icon={Volume2} label="speaker" action={toggleSpeaker} active={speakerOn} />
              <IconButton icon={Plus} label="add call" disabled />
              <IconButton icon={Video} label="FaceTime" disabled />
              <IconButton icon={Users} label="contacts" disabled />
            </div>
          </div>

          {transcript && (
            <div className="absolute bottom-[24%] left-1/2 -translate-x-1/2 w-[90%] pointer-events-none">
              <div className="bg-white/[0.06] backdrop-blur-3xl border border-white/[0.1] rounded-[1.75rem] p-5 text-[15px] font-medium leading-relaxed text-white/90 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-4 duration-500">
                {transcript}
              </div>
            </div>
          )}

          <div className="pb-6">
            <button onClick={endCall} className="w-20 h-20 bg-[#FF3B30] text-white flex items-center justify-center rounded-full active:scale-90 transition-all shadow-[0_12px_48px_rgba(255,59,48,0.35)]">
              <PhoneOff size={36} fill="currentColor" className="rotate-[135deg]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
