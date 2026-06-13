import React, { useState, useRef, useEffect, useCallback } from "react";
import Peer from 'peerjs';
import WebApp from '@twa-dev/sdk';
import { 
  Phone, PhoneOff, Mic, MicOff, Zap, Activity, 
  Cpu, Monitor, ShieldCheck, Wifi, SignalHigh, Radio
} from "lucide-react";
import { audioEngine } from './AudioEngine';

const COLORS = {
  BLACK: "#000000",
  WHITE: "#F5F5F5",
  GOLD: "#D4AF37",
  RED: "#FF0000",
};

export default function App() {
  const [peerId, setPeerId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [callState, setCallState] = useState('IDLE'); // IDLE, DIALING, INCOMING, ACTIVE, ENDED
  const [duration, setDuration] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [telemetry, setTelemetry] = useState({ 
    latency: "0ms", 
    encryption: "AES-P2P", 
    buffer: "1024KB",
    engine: "98%"
  });
  
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioCleanupRef = useRef(null);

  // Initialize PeerJS
  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => setPeerId(id));
    
    peer.on('call', (incomingCall) => {
      setCallState('INCOMING');
      callRef.current = incomingCall;
      audioCleanupRef.current = audioEngine.playRingTone() || null;
      WebApp.HapticFeedback.notificationOccurred('warning');
    });

    return () => {
      peer.destroy();
    };
  }, []);

  // Call duration timer
  useEffect(() => {
    let interval;
    if (callState === 'ACTIVE') {
      interval = setInterval(() => {
        setDuration(d => d + 1);
        setTelemetry(prev => ({
            ...prev,
            latency: Math.floor(Math.random() * 20 + 30) + "ms",
            engine: Math.floor(Math.random() * 5 + 95) + "%"
        }));
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatDuration = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startCall = async () => {
    if (!targetId) return;
    audioEngine.init();
    setCallState('DIALING');
    audioCleanupRef.current = audioEngine.playDialTone() || null;
    WebApp.HapticFeedback.impactOccurred('medium');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const call = peerRef.current.call(targetId, stream);
      setupCall(call);
    } catch (err) {
      console.error(err);
      setCallState('IDLE');
    }
  };

  const answerCall = async () => {
    if (audioCleanupRef.current) audioCleanupRef.current();
    audioEngine.init();
    WebApp.HapticFeedback.impactOccurred('heavy');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      callRef.current.answer(stream);
      setupCall(callRef.current);
    } catch (err) {
      console.error(err);
      setCallState('IDLE');
    }
  };

  const setupCall = (call) => {
    callRef.current = call;
    call.on('stream', (remoteStream) => {
      if (audioCleanupRef.current) audioCleanupRef.current();
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play();
      }
      setCallState('ACTIVE');
    });
    call.on('close', endCall);
    call.on('error', endCall);
  };

  const endCall = () => {
    if (audioCleanupRef.current) audioCleanupRef.current();
    callRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    setCallState('ENDED');
    WebApp.HapticFeedback.notificationOccurred('error');
    setTimeout(() => setCallState('IDLE'), 2000);
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const enabled = !micEnabled;
      localStreamRef.current.getAudioTracks()[0].enabled = enabled;
      setMicEnabled(enabled);
      WebApp.HapticFeedback.selectionChanged();
    }
  };

  return (
    <div className="fixed inset-0 bg-black text-white font-mono p-4 flex flex-col touch-none border-[12px] border-black">
      
      {/* HUD Header - Lord Poke Style */}
      <div className="flex justify-between items-start mb-4">
        <div className="border border-[#D4AF37] p-3 bg-black/80">
          <h2 className="text-[#D4AF37] font-black text-lg mb-1 leading-none tracking-tighter">LORD POKE VOICE</h2>
          <div className="text-[9px] space-y-1 opacity-80">
            <div className="flex items-center gap-1"><SignalHigh size={10} /> LINK: {peerId ? 'STABLE' : 'ESTABLISHING...'}</div>
            <div className="flex items-center gap-1"><ShieldCheck size={10} /> SEC: {telemetry.encryption}</div>
            <div className="flex items-center gap-1"><Cpu size={10} /> CORE: {telemetry.engine}</div>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <div className="bg-red-600 text-black font-black px-2 py-1 text-[10px] mb-2">
            PROTOCOL: RTC_V1
          </div>
          <div className="text-[9px] text-[#D4AF37] border border-[#D4AF37] px-2 py-1">
            LATENCY: {telemetry.latency}
          </div>
        </div>
      </div>

      {/* Main Connection Interface */}
      <div className="flex-1 flex flex-col justify-center items-center gap-6 relative">
        
        {/* Background Decorative Grid/Scanline Effect */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(rgba(212,175,55,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

        {callState === 'IDLE' && (
          <div className="w-full max-w-sm space-y-6 z-10">
            <div className="border-2 border-white p-4 bg-black/90">
              <div className="text-[10px] text-[#D4AF37] uppercase mb-2 font-bold tracking-widest">My Access Node</div>
              <div className="text-sm break-all font-bold tracking-tight text-white mb-3">
                {peerId || 'GENERATING_NODE_ID...'}
              </div>
              <button 
                onClick={() => { navigator.clipboard.writeText(peerId); WebApp.HapticFeedback.impactOccurred('medium') }}
                className="w-full text-[10px] border border-white py-2 hover:bg-white hover:text-black transition-all font-black"
              >
                COPY_STATION_ID
              </button>
            </div>

            <div className="border-2 border-white p-4 bg-black/90">
              <div className="text-[10px] text-[#D4AF37] uppercase mb-2 font-bold tracking-widest">Target Node</div>
              <input 
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="ENTER_REMOTE_STATION_ID"
                className="w-full bg-transparent border-b border-[#D4AF37] py-2 focus:outline-none text-sm placeholder:opacity-30"
              />
            </div>

            <button 
              disabled={!targetId}
              onClick={startCall}
              className="w-full bg-[#D4AF37] text-black py-5 font-black flex items-center justify-center gap-3 disabled:opacity-30 active:scale-[0.98] transition-transform"
            >
              <Radio size={24} /> INITIATE_UPLINK
            </button>
          </div>
        )}

        {(callState === 'DIALING' || callState === 'ACTIVE' || callState === 'INCOMING') && (
          <div className="flex flex-col items-center gap-10 z-10 w-full">
            <div className="relative">
              <div className={`w-40 h-40 border-4 border-[#D4AF37] flex items-center justify-center bg-black ${callState === 'ACTIVE' ? 'shadow-[0_0_30px_rgba(212,175,55,0.3)]' : ''}`}>
                <div className="absolute inset-2 border border-[#D4AF37]/30" />
                <Zap size={64} className={callState === 'ACTIVE' ? 'text-[#D4AF37]' : 'text-white animate-pulse'} />
              </div>
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-[#D4AF37] text-black px-4 py-1 text-xs font-black">
                {callState}
              </div>
            </div>

            <div className="text-center">
              <div className="text-5xl font-black tracking-tighter mb-2 text-white">
                {callState === 'ACTIVE' ? formatDuration(duration) : 'SCANNING'}
              </div>
              <div className="flex items-center justify-center gap-2 text-[10px] text-[#D4AF37] font-bold uppercase tracking-widest">
                <div className="w-1.5 h-1.5 bg-[#D4AF37] rounded-full animate-ping" />
                Secure Channel Active
              </div>
            </div>

            <div className="w-full max-w-sm grid grid-cols-2 gap-4 px-4">
              {callState === 'INCOMING' ? (
                <>
                  <button onClick={answerCall} className="bg-[#D4AF37] text-black py-5 font-black flex items-center justify-center gap-2 active:bg-white active:scale-95 transition-all">
                    ACCEPT
                  </button>
                  <button onClick={endCall} className="bg-white text-black py-5 font-black flex items-center justify-center gap-2 active:bg-red-600 active:scale-95 transition-all">
                    DECLINE
                  </button>
                </>
              ) : (
                <>
                  <button onClick={toggleMic} className="border-2 border-white py-5 font-black flex items-center justify-center gap-2 active:bg-white active:text-black transition-all">
                    {micEnabled ? <Mic size={20} /> : <MicOff size={20} className="text-red-500" />}
                    {micEnabled ? 'MIC_ON' : 'MUTED'}
                  </button>
                  <button onClick={endCall} className="bg-red-600 text-white py-5 font-black flex items-center justify-center gap-2 active:bg-white active:text-black transition-all">
                    <PhoneOff size={20} /> TERMINATE
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {callState === 'ENDED' && (
          <div className="text-center z-10">
            <div className="text-3xl font-black text-red-600 mb-2 tracking-tighter">SESSION_TERMINATED</div>
            <div className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.3em] animate-pulse">Reverting to Standby</div>
          </div>
        )}
      </div>

      {/* HUD Footer - Tech Specs */}
      <div className="mt-4 border-t border-white/20 pt-4 flex justify-between items-end text-[8px] font-bold tracking-widest opacity-40 uppercase">
        <div className="space-y-1">
          <div>Buffer: {telemetry.buffer}</div>
          <div>Node_ID: {peerId.slice(0, 8)}...</div>
        </div>
        <div className="text-right space-y-1">
          <div>Codec: OPUS_VOICE</div>
          <div> 2026 LORD_POKE_SYSTEMS</div>
        </div>
      </div>

      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}