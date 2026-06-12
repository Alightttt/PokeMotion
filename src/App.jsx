import React, { useState, useRef, useEffect, useCallback } from "react";
import { Menu, X, Cpu, Activity, MessageSquare } from "lucide-react";

const COLORS = {
  BLACK: "#000000",
  WHITE: "#F5F5F5",
  GOLD: "#D4AF37",
  RED: "#FF0000",
};

const TAUNTS = [
  "Easiest point of my life.",
  "Lagging much?",
  "My AI is sleeping and still winning.",
  "Is that your best move?",
  "Calculated.",
  "Too slow, human."
];

export default function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [telemetry, setTelemetry] = useState({ rage: "LOW", spin: "0.00", engine: "0%" });
  const [taunt, setTaunt] = useState("System ready.");
  const canvasRef = useRef(null);
  
  const gameState = useRef({
    ball: { x: 400, y: 300, vx: 5, vy: 5, radius: 10 },
    p1: { x: 400, y: 550, w: 100, h: 15, score: 0 },
    p2: { x: 400, y: 50, w: 100, h: 15, score: 0 },
    mouse: { x: 400, y: 550 },
    aiDelay: 150,
  });

  const resetBall = () => {
    gameState.current.ball = { x: 400, y: 300, vx: 5 * (Math.random() > 0.5 ? 1 : -1), vy: 5, radius: 10 };
    if (Math.random() > 0.7) setTaunt(TAUNTS[Math.floor(Math.random() * TAUNTS.length)]);
  };

  const update = useCallback(() => {
    const state = gameState.current;
    const b = state.ball;
    b.x += b.vx;
    b.y += b.vy;

    if (b.x - b.radius < 0 || b.x + b.radius > 800) b.vx *= -1;
    if (b.y < 0) { state.p1.score++; resetBall(); }
    if (b.y > 600) { state.p2.score++; resetBall(); }

    state.p1.x = state.mouse.x;
    if (b.y + b.radius > state.p1.y && b.y < state.p1.y + state.p1.h && b.x > state.p1.x - state.p1.w/2 && b.x < state.p1.x + state.p1.w/2) {
      b.vy = -Math.abs(b.vy);
    }

    setTimeout(() => {
      const target = b.x;
      const dx = target - state.p2.x;
      const speed = 6;
      state.p2.x += Math.max(-speed, Math.min(speed, dx));
      state.p2.x = Math.max(state.p2.w/2, Math.min(800 - state.p2.w/2, state.p2.x));

      if (b.y - b.radius < state.p2.y + state.p2.h && b.y > state.p2.y && b.x > state.p2.x - state.p2.w/2 && b.x < state.p2.x + state.p2.w/2) {
        b.vy = Math.abs(b.vy);
      }
    }, state.aiDelay);

    setTelemetry({
      rage: state.p1.score < state.p2.score ? "HIGH" : "LOW",
      spin: Math.abs(b.vx).toFixed(2),
      engine: (Math.random() * 100).toFixed(0) + "%"
    });
  }, []);

  const loop = useCallback(() => {
    if (!gameStarted) return;
    update();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = COLORS.BLACK;
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = COLORS.WHITE;
    ctx.beginPath(); ctx.arc(gameState.current.ball.x, gameState.current.ball.y, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(gameState.current.p1.x - 50, gameState.current.p1.y, 100, 15);
    ctx.fillRect(gameState.current.p2.x - 50, gameState.current.p2.y, 100, 15);
    requestAnimationFrame(loop);
  }, [gameStarted, update]);

  useEffect(() => {
    requestAnimationFrame(loop);
    const handleMove = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        gameState.current.mouse.x = e.clientX - rect.left;
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [loop]);

  return (
    <div className="fixed inset-0 bg-black text-white font-mono p-4">
      <div className="absolute top-4 left-4 border border-[#D4AF37] p-4 bg-black/80">
        <h2 className="text-[#D4AF37] font-black text-xl mb-2">LORD POKE HUD</h2>
        <div className="text-[12px] space-y-2">
            <div>RAGE LEVEL: {telemetry.rage}</div>
            <div>CALCULATED SPIN: {telemetry.spin}</div>
            <div>INSULT ENGINE LOAD: {telemetry.engine}</div>
        </div>
      </div>
      <div className="absolute top-4 right-4 bg-red-600 text-black font-black px-4 py-2 animate-bounce flex items-center gap-2">
        <MessageSquare size={16}/> {taunt}
      </div>
      <canvas ref={canvasRef} width={800} height={600} className="w-full h-full object-contain" />
      {!gameStarted && (
        <button onClick={() => setGameStarted(true)} className="absolute inset-0 bg-black flex items-center justify-center font-black text-4xl text-red-600">
          INITIATE POKE
        </button>
      )}
    </div>
  );
}