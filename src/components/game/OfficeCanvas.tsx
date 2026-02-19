'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { AgentTask } from '@/hooks/useTasks';
import type { Skin } from '@/lib/shared/skins';

interface OfficeCanvasProps {
  tasks: AgentTask[];
  activeSkin: Skin;
}

interface Agent {
  x: number;
  y: number;
  role: string;
  label: string;
  baseY: number;
  color: string;
  status: 'idle' | 'working' | 'success' | 'failed';
  animOffset: number;
}

const AGENT_COLORS: Record<string, string> = {
  proxy: '#3b82f6',
  minion: '#8b5cf6',
  scout: '#10b981',
  sage: '#f59e0b',
};

const AGENTS: Omit<Agent, 'animOffset'>[] = [
  { x: 200, y: 370, baseY: 370, role: 'minion', label: 'Minion', color: AGENT_COLORS.minion, status: 'idle' },
  { x: 400, y: 320, baseY: 320, role: 'proxy', label: 'Proxy', color: AGENT_COLORS.proxy, status: 'idle' },
  { x: 600, y: 370, baseY: 370, role: 'scout', label: 'Scout', color: AGENT_COLORS.scout, status: 'idle' },
  { x: 400, y: 420, baseY: 420, role: 'sage', label: 'Sage', color: AGENT_COLORS.sage, status: 'idle' },
];

export function OfficeCanvas({ tasks, activeSkin }: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const agentsRef = useRef<Agent[]>(
    AGENTS.map((a, i) => ({ ...a, animOffset: i * 1.5 }))
  );

  // Update agent statuses from tasks
  useEffect(() => {
    const statusMap = new Map<string, string>();
    tasks.forEach((task) => {
      const current = statusMap.get(task.agent_role);
      if (!current || task.status === 'working') {
        statusMap.set(task.agent_role, task.status);
      }
    });

    agentsRef.current.forEach((agent) => {
      const status = statusMap.get(agent.role);
      if (status === 'working' || status === 'success' || status === 'failed') {
        agent.status = status;
      } else {
        agent.status = 'idle';
      }
    });
  }, [tasks]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, time: number) => {
    const W = 800;
    const H = 600;
    ctx.clearRect(0, 0, W, H);

    // Background wall
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);

    // Floor
    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 440, W, 160);

    // Floor grid lines (pixel-art style)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 50, 440);
      ctx.lineTo(i * 50, 600);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 440 + i * 40);
      ctx.lineTo(800, 440 + i * 40);
      ctx.stroke();
    }

    // Windows on back wall
    const windowPositions = [150, 350, 550];
    windowPositions.forEach((wx) => {
      // Window frame
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(wx - 45, 80, 90, 140);
      // Window glass
      const gradient = ctx.createLinearGradient(wx - 40, 85, wx - 40, 215);
      gradient.addColorStop(0, '#4a6fa5');
      gradient.addColorStop(0.5, '#87ceeb');
      gradient.addColorStop(1, '#6ba3d0');
      ctx.fillStyle = gradient;
      ctx.fillRect(wx - 40, 85, 80, 130);
      // Window divider
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(wx - 1, 85, 2, 130);
      ctx.fillRect(wx - 40, 148, 80, 2);
    });

    // Desks and agents
    agentsRef.current.forEach((agent) => {
      const t = time / 1000;

      // Desk shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(agent.x - 62, agent.y + 32, 124, 8);

      // Desk surface
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(agent.x - 60, agent.y + 10, 120, 30);
      // Desk top highlight
      ctx.fillStyle = '#444444';
      ctx.fillRect(agent.x - 60, agent.y + 10, 120, 4);

      // Monitor on desk
      ctx.fillStyle = '#222222';
      ctx.fillRect(agent.x - 15, agent.y - 8, 30, 20);
      // Screen glow
      const screenColor = agent.status === 'working' ? agent.color :
                          agent.status === 'success' ? '#10b981' :
                          agent.status === 'failed' ? '#ef4444' : '#1e3a5f';
      ctx.fillStyle = screenColor;
      ctx.fillRect(agent.x - 13, agent.y - 6, 26, 16);
      // Monitor stand
      ctx.fillStyle = '#333333';
      ctx.fillRect(agent.x - 3, agent.y + 12, 6, 6);

      // Agent body - bobbing animation
      let bobY = 0;
      let scale = 1;
      let agentColor = agent.color;

      if (agent.status === 'idle') {
        bobY = Math.sin(t * 1.5 + agent.animOffset) * 4;
      } else if (agent.status === 'working') {
        bobY = Math.sin(t * 4 + agent.animOffset) * 2;
        scale = 1 + Math.sin(t * 6) * 0.05;
      } else if (agent.status === 'success') {
        bobY = -Math.abs(Math.sin(t * 3)) * 8;
        agentColor = '#10b981';
      } else if (agent.status === 'failed') {
        bobY = Math.sin(t * 12) * 3;
        agentColor = '#ef4444';
      }

      const agentY = agent.baseY - 30 + bobY;
      const halfW = 16 * scale;
      const halfH = 20 * scale;

      // Agent shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(agent.x, agent.baseY + 10, 14, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Agent body (rounded rectangle)
      ctx.fillStyle = agentColor;
      ctx.beginPath();
      ctx.roundRect(agent.x - halfW, agentY - halfH, halfW * 2, halfH * 2, 6);
      ctx.fill();

      // Agent face: eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(agent.x - 7, agentY - 6, 5, 5);
      ctx.fillRect(agent.x + 2, agentY - 6, 5, 5);
      // Pupils
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(agent.x - 5, agentY - 4, 2, 2);
      ctx.fillRect(agent.x + 4, agentY - 4, 2, 2);

      // Status indicator glow
      if (agent.status === 'working') {
        ctx.save();
        ctx.globalAlpha = 0.3 + Math.sin(t * 4) * 0.15;
        ctx.shadowColor = agent.color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = agent.color;
        ctx.beginPath();
        ctx.roundRect(agent.x - halfW - 2, agentY - halfH - 2, (halfW + 2) * 2, (halfH + 2) * 2, 8);
        ctx.fill();
        ctx.restore();
      }

      // Role label
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(agent.label, agent.x, agent.baseY + 52);
    });

    // Subtle vignette
    const vignette = ctx.createRadialGradient(400, 300, 200, 400, 300, 450);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 600;

    let running = true;
    const loop = (time: number) => {
      if (!running) return;
      draw(ctx, time);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a]">
      <canvas
        ref={canvasRef}
        className="h-full w-full object-contain"
        style={{ imageRendering: 'pixelated', maxWidth: '800px', maxHeight: '600px' }}
      />
    </div>
  );
}
