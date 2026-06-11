import React, { useState, useRef, useEffect, useCallback } from "react";
import { Menu, X, Monitor, Cpu, Zap, Activity } from "lucide-react";

// --- Constants & Config ---
const COLORS = {
BLACK: "#000000",
WHITE: "#F5F5F5",
GOLD: "#D4AF37",
RED: "#FF0000",
};

const GAMES = {
PING_PONG: "Ping Pong",
CARROM: "Carrom",
AIR_HOCKEY: "Air Hockey",
};

// --- Audio System ---
const useAudio = () => {
const audioCtx = useRef(null);

const initAudio = async () => {
if (!audioCtx.current) {
audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
}
if (audioCtx.current.state === "suspended") {
await audioCtx.current.resume();
}
return audioCtx.current;
};

const playSound = async (type) => {
const ctx = await initAudio();
const osc = ctx.createOscillator();
const gain = ctx.createGain();

osc.connect(gain);
gain.connect(ctx.destination);

const now = ctx.currentTime;

if (type === "thud") {
osc.type = "sine";
osc.frequency.setValueAtTime(150, now);
osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
gain.gain.setValueAtTime(0.3, now);
gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
osc.start(now);
osc.stop(now + 0.1);
} else if (type === "click") {
osc.type = "square";
osc.frequency.setValueAtTime(800, now);
osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
gain.gain.setValueAtTime(0.1, now);
gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
osc.start(now);
osc.stop(now + 0.05);
} else if (type === "score") {
osc.type = "sawtooth";
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

// --- Game Engine Logic ---
export default function App() {
const [currentGame, setCurrentGame] = useState(GAMES.PING_PONG);
const [isMenuOpen, setIsMenuOpen] = useState(false);
const [gameStarted, setGameStarted] = useState(false);
const [telemetry, setTelemetry] = useState({ target: "0, 0", latency: "0ms", motor: "0%", thought: "Initializing..." });

const canvasRef = useRef(null);
const { playSound, initAudio } = useAudio();
const gameState = useRef({
ball: { x: 400, y: 300, vx: 5, vy: 5, radius: 10, spin: 0 },
p1: { x: 400, y: 550, w: 100, h: 15, score: 0 }, // User
p2: { x: 400, y: 50, w: 100, h: 15, score: 0 },  // AI
lastTime: 0,
mouse: { x: 400, y: 550 },
});

const resetBall = () => {
gameState.current.ball = { x: 400, y: 300, vx: (Math.random() > 0.5 ? 5 : -5), vy: 5, radius: 10, spin: 0 };
playSound("score");
};

const startGame = async () => {
await initAudio();
setGameStarted(true);
setIsMenuOpen(false);
};

const updatePingPong = useCallback((dt) => {
const state = gameState.current;
const b = state.ball;

b.x += b.vx;
b.y += b.vy;
b.vx += b.spin * 0.1;

if (b.x - b.radius < 0 || b.x + b.radius > 800) {
b.vx *= -1;
playSound("thud");
}

if (b.y < 0) { state.p1.score++; resetBall(); }
if (b.y > 600) { state.p2.score++; resetBall(); }

state.p1.x = state.mouse.x;
if (b.y + b.radius > state.p1.y && b.y < state.p1.y + state.p1.h && b.x > state.p1.x - state.p1.w/2 && b.x < state.p1.x + state.p1.w/2) {
const relativeIntersect = (b.x - state.p1.x) / (state.p1.w / 2);
b.vy = -Math.abs(b.vy);
b.vx = relativeIntersect * 10;
b.spin = relativeIntersect * 5;
playSound("click");
}

const aiTarget = b.x;
const aiSpeed = 4;
if (state.p2.x < aiTarget) state.p2.x += aiSpeed;
else state.p2.x -= aiSpeed;

if (b.y - b.radius < state.p2.y + state.p2.h && b.y > state.p2.y && b.x > state.p2.x - state.p2.w/2 && b.x < state.p2.x + state.p2.w/2) {
b.vy = Math.abs(b.vy);
playSound("click");
}

setTelemetry({
target: `${Math.round(b.x)}, ${Math.round(b.y)}`,
latency: `${Math.round(Math.random() * 5 + 2)}ms`,
motor: `${Math.round(Math.abs(state.p2.x - aiTarget) / 10)}%`,
thought: b.vy < 0 ? "Tracking ball trajectory..." : "Positioning for return...",
});
}, [playSound]);

const updateCarrom = useCallback((dt) => {
const state = gameState.current;
const b = state.ball;
b.x += b.vx; b.y += b.vy;
b.vx *= 0.98; b.vy *= 0.98;
if (b.x < 0 || b.x > 800) b.vx *= -1;
if (b.y < 0 || b.y > 600) b.vy *= -1;
setTelemetry({ target: "Strikepoint Alpha", latency: "12ms", motor: "15%", thought: "Calculating rebound vector..." });
}, []);

const updateAirHockey = useCallback((dt) => {
const state = gameState.current;
const b = state.ball;
b.x += b.vx; b.y += b.vy;
if (b.x < 0 || b.x > 800) { b.vx *= -1; playSound("thud"); }

const distP1 = Math.hypot(b.x - state.p1.x, b.y - state.p1.y);
if (distP1 < 40) {
b.vx = (b.x - state.p1.x) * 0.5;
b.vy = (b.y - state.p1.y) * 0.5;
playSound("click");
}

state.p2.x += (b.x - state.p2.x) * 0.1;
const distP2 = Math.hypot(b.x - state.p2.x, b.y - state.p2.y);
if (distP2 < 40) {
b.vx = (b.x - state.p2.x) * 0.5;
b.vy = (b.y - state.p2.y) * 0.5;
playSound("click");
}

if (b.y < 0 || b.y > 600) resetBall();

setTelemetry({ target: "Puck Intersection", latency: "4ms", motor: "85%", thought: "Elastic momentum transfer active." });
}, [playSound]);

const loop = useCallback((time) => {
if (!gameStarted) return;
const dt = time - gameState.current.lastTime;
gameState.current.lastTime = time;

if (currentGame === GAMES.PING_PONG) updatePingPong(dt);
else if (currentGame === GAMES.CARROM) updateCarrom(dt);
else if (currentGame === GAMES.AIR_HOCKEY) updateAirHockey(dt);

const canvas = canvasRef.current;
if (canvas) {
const ctx = canvas.getContext("2d");
if (!ctx) return;
ctx.fillStyle = COLORS.BLACK;
ctx.fillRect(0, 0, 800, 600);

ctx.strokeStyle = COLORS.WHITE;
ctx.lineWidth = 2;
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

ctx.fillStyle = COLORS.GOLD;
ctx.font = "bold 32px JetBrains Mono";
ctx.textAlign = "left";
ctx.fillText(gameState.current.p2.score.toString().padStart(2, "0"), 20, 280);
ctx.fillText(gameState.current.p1.score.toString().padStart(2, "0"), 20, 340);
}
requestAnimationFrame(loop);
}, [gameStarted, currentGame, updatePingPong, updateCarrom, updateAirHockey]);

useEffect(() => {
const animationId = requestAnimationFrame(loop);

const handleMove = (e) => {
if (e.cancelable) e.preventDefault();
const canvas = canvasRef.current;
if (!canvas) return;

const rect = canvas.getBoundingClientRect();
if (!rect) return;

const clientX = e.touches ? e.touches[0].clientX : e.clientX;
const clientY = e.touches ? e.touches[0].clientY : e.clientY;

const x = clientX - rect.left;
const y = clientY - rect.top;

gameState.current.mouse = { 
x: (x / rect.width) * 800, 
y: (y / rect.height) * 600 
};
};

window.addEventListener("mousemove", handleMove);
window.addEventListener("touchmove", handleMove, { passive: false });
return () => {
cancelAnimationFrame(animationId);
window.removeEventListener("mousemove", handleMove);
window.removeEventListener("touchmove", handleMove);
};
}, [loop]);

return (
<div className="fixed inset-0 bg-black text-[#F5F5F5] font-mono overflow-hidden select-none" style={{ height: "100dvh" }}>
{/* HUD Telemetry (AI Side - Top) */}
<div className="absolute top-4 left-4 z-10 pointer-events-none">
<div className="text-[10px] text-[#D4AF37] uppercase tracking-widest mb-1 flex items-center gap-2">
<Cpu size={12} /> POKE_NEURAL_LINK_v4
</div>
<div className="space-y-1 text-[12px] text-[#D4AF37] font-bold tabular-nums">
<div>TARGET_VECTOR: {telemetry.target}</div>
<div>NET_LATENCY: {telemetry.latency}</div>
<div>MOTOR_LOAD: {telemetry.motor}</div>
<div className="text-white mt-2 opacity-90 tracking-tight">{">"} {telemetry.thought}</div>
</div>
</div>

{/* Game Canvas */}
<div className="w-full h-full flex items-center justify-center bg-black">
<canvas 
ref={canvasRef} 
width={800} 
height={600} 
className="w-full h-full object-contain border-0"
style={{ imageRendering: "pixelated", touchAction: "none" }}
/>
</div>

{/* Menu Trigger */}
<button 
onClick={() => setIsMenuOpen(!isMenuOpen)}
className="absolute top-4 right-4 z-50 p-2 bg-black border border-[#F5F5F5] transition-none hover:bg-[#F5F5F5] hover:text-black"
>
{isMenuOpen ? <X size={24} /> : <Menu size={24} />}
</button>

{/* Start / Menu Overlay */}
{(!gameStarted || isMenuOpen) && (
<div className="absolute inset-0 z-40 bg-black flex flex-col items-center justify-center p-8">
<div className="mb-12 text-center">
<h1 className="text-6xl font-black italic tracking-tighter text-[#FF0000] mb-2 leading-none">POKE_MOTION</h1>
<p className="text-[#D4AF37] text-xs font-bold tracking-[0.2em] uppercase">Advanced Neural Arcade System</p>
</div>

{!gameStarted ? (
<button 
onClick={startGame}
className="group relative px-12 py-6 bg-[#D4AF37] text-black font-black text-2xl uppercase tracking-tighter transition-none hover:bg-white"
>
Initialize System
<div className="absolute -inset-1 border border-[#D4AF37] group-hover:border-white animate-pulse" />
</button>
) : (
<div className="flex flex-col gap-2 w-full max-w-xs">
{Object.values(GAMES).map(game => (
<button 
key={game}
onClick={() => { setCurrentGame(game); setIsMenuOpen(false); }}
className={`p-5 text-left uppercase font-black tracking-widest border transition-none ${currentGame === game ? "bg-[#F5F5F5] text-black border-white" : "bg-black text-white border-white/20 hover:border-white"}`}
>
{game}
</button>
))}
<button 
onClick={() => setIsMenuOpen(false)}
className="mt-4 p-4 text-center uppercase font-bold text-xs tracking-widest text-white/50 hover:text-white"
>
Return to Simulation
</button>
</div>
)}
</div>
)}

{/* UI Accents */}
<div className="absolute bottom-4 left-4 text-[10px] text-[#D4AF37] uppercase tracking-[0.3em] font-bold">
SPEC_4.0.0 // BRUTALIST_SPEC // JETBRAINS_MONO
</div>
<div className="absolute bottom-4 right-4 flex items-center gap-2 text-[#FF0000]">
<Activity size={14} className="animate-pulse" />
<span className="text-[10px] font-black tracking-widest">SYSTEM_OPTIMAL_STABLE</span>
</div>
</div>
);
}
