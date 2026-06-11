import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Menu, X, Monitor, Cpu, Zap, Activity } from 'lucide-react';

const COLORS = {
  BLACK: '#000000',
  WHITE: '#F5F5F5',
  GOLD: '#D4AF37',
  RED: '#FF0000',
};

const GAMES = {
  PING_PONG: 'Ping Pong',
  CARROM: 'Carrom',
  AIR_HOCKEY: 'Air Hockey',
};

const useAudio = () => {
  const audioCtx = useRef(null);
  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.current.state === 'suspended') {
      audioCtx.current.resume();
    }
  };
  const playSound = (type) => {
    initAudio();
    const ctx = audioCtx.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'thud') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'click') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'score') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  };
  return { playSound, initAudio };
};

export default function App() {
  const [currentGame, setCurrentGame] = useState(GAMES.PING_PONG);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [telemetry, setTelemetry] = useState({ target: '0, 0', latency: '0ms', motor: '0%', thought: 'Initializing...' });
  const canvasRef = useRef(null);
  const frameId = useRef(null);
  const { playSound, initAudio } = useAudio();
  const gameState = useRef({
    ball: { x: 400, y: 300, vx: 5, vy: 5, radius: 10, spin: 0 },
    p1: { x: 400, y: 550, w: 100, h: 15, score: 0 },
    p2: { x: 400, y: 50, w: 100, h: 15, score: 0 },
    lastTime: 0,
    mouse: { x: 400, y: 550 },
  });

  const resetBall = () => {
    gameState.current.ball = { x: 400, y: 300, vx: (Math.random() > 0.5 ? 5 : -5), vy: 5, radius: 10, spin: 0 };
    playSound('score');
  };

  const updatePingPong = (dt) => {
    const state = gameState.current;
    const b = state.ball;
    b.x += b.vx;
    b.y += b.vy;
    b.vx += b.spin * 0.1;
    if (b.x - b.radius < 0 || b.x + b.radius > 800) { b.vx *= -1; playSound('thud'); }
    if (b.y < 0) { state.p1.score++; resetBall(); }
    if (b.y > 600) { state.p2.score++; resetBall(); }
    state.p1.x = state.mouse.x;
    if (b.y + b.radius > state.p1.y && b.y < state.p1.y + state.p1.h && b.x > state.p1.x - state.p1.w/2 && b.x < state.p1.x + state.p1.w/2) {
      const relativeIntersect = (b.x - state.p1.x) / (state.p1.w / 2);
      b.vy = -Math.abs(b.vy);
      b.vx = relativeIntersect * 10;
      b.spin = relativeIntersect * 5;
      playSound('click');
    }
    const aiTarget = b.x;
    const aiSpeed = 4;
    if (state.p2.x < aiTarget) state.p2.x += aiSpeed;
    else state.p2.x -= aiSpeed;
    if (b.y - b.radius < state.p2.y + state.p2.h && b.y > state.p2.y && b.x > state.p2.x - state.p2.w/2 && b.x < state.p2.x + state.p2.w/2) {
      b.vy = Math.abs(b.vy);
      playSound('click');
    }
    setTelemetry({
      target: \`\${Math.round(b.x)}, \${Math.round(b.y)}\`,
      latency: \`\${Math.round(Math.random() * 5 + 2)}ms\`,
      motor: \`\${Math.round(Math.abs(state.p2.x - aiTarget) / 10)}%\`,
      thought: b.vy < 0 ? "Tracking ball trajectory..." : "Positioning for return...",
    });
  };

  const updateCarrom = (dt) => {
     const state = gameState.current;
     const b = state.ball;
     b.x += b.vx; b.y += b.vy;
     b.vx *= 0.98; b.vy *= 0.98;
     if (b.x < 0 || b.x > 800) b.vx *= -1;
     if (b.y < 0 || b.y > 600) b.vy *= -1;
     setTelemetry({ target: "Strikepoint Alpha", latency: "12ms", motor: "15%", thought: "Calculating rebound vector..." });
  };

  const updateAirHockey = (dt) => {
    const state = gameState.current;
    const b = state.ball;
    b.x += b.vx; b.y += b.vy;
    if (b.x < 0 || b.x > 800) { b.vx *= -1; playSound('thud'); }
    const distP1 = Math.hypot(b.x - state.p1.x, b.y - state.p1.y);
    if (distP1 < 40) {
       b.vx = (b.x - state.p1.x) * 0.5;
       b.vy = (b.y - state.p1.y) * 0.5;
       playSound('click');
    }
    state.p2.x += (b.x - state.p2.x) * 0.1;
    state.p2.y += (b.y - state.p2.y) * 0.1;
    if (state.p2.y > 250) state.p2.y = 250;
    if (state.p2.y < 50) state.p2.y = 50;
    const distP2 = Math.hypot(b.x - state.p2.x, b.y - state.p2.y);
    if (distP2 < 40) {
        b.vx = (b.x - state.p2.x) * 0.5;
        b.vy = (b.y - state.p2.y) * 0.5;
        playSound('click');
    }
    if (b.y < 0 || b.y > 600) resetBall();
    setTelemetry({ target: "Puck Intersection", latency: "4ms", motor: "85%", thought: "Elastic momentum transfer active." });
  };

  const loop = (time) => {
    const dt = time - gameState.current.lastTime;
    gameState.current.lastTime = time;
    if (currentGame === GAMES.PING_PONG) updatePingPong(dt);
    else if (currentGame === GAMES.CARROM) updateCarrom(dt);
    else if (currentGame === GAMES.AIR_HOCKEY) updateAirHockey(dt);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = COLORS.BLACK;
      ctx.fillRect(0, 0, 800, 600);
      ctx.strokeStyle = COLORS.WHITE;
      ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.moveTo(0, 300); ctx.lineTo(800, 300); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.WHITE;
      ctx.beginPath(); ctx.arc(gameState.current.ball.x, gameState.current.ball.y, gameState.current.ball.radius, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = COLORS.WHITE;
      if (currentGame === GAMES.PING_PONG) {
        ctx.fillRect(gameState.current.p1.x - 50, gameState.current.p1.y, 100, 15);
        ctx.fillRect(gameState.current.p2.x - 50, gameState.current.p2.y, 100, 15);
      } else {
        ctx.beginPath(); ctx.arc(gameState.current.p1.x, gameState.current.p1.y, 30, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(gameState.current.p2.x, gameState.current.p2.y, 30, 0, Math.PI*2); ctx.fill();
      }
      ctx.font = '24px "JetBrains Mono"';
      ctx.fillText(gameState.current.p2.score, 20, 280);
      ctx.fillText(gameState.current.p1.score, 20, 330);
    }
    frameId.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    frameId.current = requestAnimationFrame(loop);
    const handleMove = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
      gameState.current.mouse = { x: (x / rect.width) * 800, y: (y / rect.height) * 600 };
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, { passive: false });
    return () => {
      cancelAnimationFrame(frameId.current);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
    };
  }, [currentGame]);

  const handleInteraction = () => {
    initAudio();
  };

  return (
    <div 
      className="fixed inset-0 bg-black text-[#F5F5F5] font-mono overflow-hidden select-none" 
      style={{ height: '100dvh' }}
      onClick={handleInteraction}
    >
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="text-[10px] text-[#D4AF37] uppercase tracking-widest mb-1 flex items-center gap-2">
          <Cpu size={12} /> Poke_Neural_Link
        </div>
        <div className="space-y-1 text-[12px] text-[#D4AF37] font-bold tabular-nums">
          <div>TARGET: {telemetry.target}</div>
          <div>LATENCY: {telemetry.latency}</div>
          <div>MOTOR_SPEED: {telemetry.motor}</div>
          <div className="text-white mt-2 opacity-80">{">"} {telemetry.thought}</div>
        </div>
      </div>
      <div className="w-full h-full flex items-center justify-center">
        <canvas ref={canvasRef} width={800} height={600} className="w-full h-full object-contain border-0" style={{ imageRendering: 'pixelated' }} />
      </div>
      <button onClick={() => { setIsMenuOpen(!isMenuOpen); handleInteraction(); }} className="absolute top-4 right-4 z-50 p-2 bg-black border border-[#F5F5F5] hover:bg-[#F5F5F5] hover:text-black transition-colors">
        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>
      {isMenuOpen && (
        <div className="absolute inset-0 z-40 bg-black/95 flex flex-col items-center justify-center space-y-8">
          <h2 className="text-4xl font-black italic tracking-tighter text-[#FF0000]">POKE_MOTION</h2>
          <div className="flex flex-col gap-4 w-64">
            {Object.values(GAMES).map(game => (
              <button key={game} onClick={() => { setCurrentGame(game); setIsMenuOpen(false); handleInteraction(); }} className={`p-4 border text-left uppercase font-bold tracking-widest \${currentGame === game ? 'bg-[#F5F5F5] text-black' : 'border-[#F5F5F5] hover:bg-white/10'}`}>
                {game}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 text-[10px] opacity-40 uppercase tracking-widest">v4.0.0_Arcade_Spec // Local_Multiplayer</div>
      <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[#FF0000]">
        <Activity size={14} />
        <span className="text-[10px] font-bold tracking-widest">SYSTEM_OPTIMAL</span>
      </div>
    </div>
  );
}