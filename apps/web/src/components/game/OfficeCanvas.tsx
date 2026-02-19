'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { AgentTask } from '@/hooks/useTasks';
import type { Skin } from '@proxyos/shared/skins';

interface OfficeCanvasProps {
  tasks: AgentTask[];
  activeSkin: Skin;
}

export function OfficeCanvas({ tasks, activeSkin }: OfficeCanvasProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    class OfficeScene extends Phaser.Scene {
      private agents: Map<string, Phaser.GameObjects.Sprite> = new Map();
      private taskStatuses: Map<string, string> = new Map();

      constructor() {
        super({ key: 'OfficeScene' });
      }

      create() {
        // Background
        this.add.rectangle(400, 300, 800, 600, 0x1a1a1a);

        // Floor
        this.add.rectangle(400, 500, 800, 200, 0x2a2a2a);

        // Desks
        const deskPositions = [
          { x: 200, y: 400, agent: 'minion' },
          { x: 400, y: 350, agent: 'proxy' },
          { x: 600, y: 400, agent: 'scout' },
          { x: 400, y: 450, agent: 'sage' },
        ];

        deskPositions.forEach(({ x, y, agent }) => {
          // Desk
          this.add.rectangle(x, y, 120, 60, 0x3a3a3a);

          // Agent placeholder (will be replaced with skin sprites)
          const agentSprite = this.add.rectangle(x, y - 30, 40, 40, 0x4a4a4a);
          agentSprite.setData('agent', agent);
          this.agents.set(agent, agentSprite as any);

          // Idle animation
          this.tweens.add({
            targets: agentSprite,
            y: y - 35,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        });

        // Windows (back wall)
        this.add.rectangle(200, 150, 100, 150, 0x87ceeb);
        this.add.rectangle(400, 150, 100, 150, 0x87ceeb);
        this.add.rectangle(600, 150, 100, 150, 0x87ceeb);
      }

      updateAgentStatus(agentRole: string, status: string) {
        const agent = this.agents.get(agentRole);
        if (!agent) return;

        const oldStatus = this.taskStatuses.get(agentRole);
        if (oldStatus === status) return;

        this.taskStatuses.set(agentRole, status);

        // Stop existing tweens
        this.tweens.killTweensOf(agent);

        if (status === 'working') {
          // Working animation: rapid pulsing
          this.tweens.add({
            targets: agent,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 300,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
          agent.setTint(0x3b82f6); // Blue tint
        } else if (status === 'success') {
          // Success: green flash then return to idle
          agent.setTint(0x10b981);
          this.tweens.add({
            targets: agent,
            alpha: 0.5,
            duration: 200,
            yoyo: true,
            onComplete: () => {
              agent.clearTint();
              this.startIdleAnimation(agent);
            },
          });
        } else if (status === 'failed') {
          // Failed: red shake
          agent.setTint(0xef4444);
          this.tweens.add({
            targets: agent,
            x: agent.x - 5,
            duration: 50,
            yoyo: true,
            repeat: 5,
            onComplete: () => {
              agent.clearTint();
              this.startIdleAnimation(agent);
            },
          });
        } else {
          // Idle
          agent.clearTint();
          this.startIdleAnimation(agent);
        }
      }

      startIdleAnimation(agent: Phaser.GameObjects.Sprite) {
        const y = agent.getData('originalY') ?? agent.y;
        this.tweens.add({
          targets: agent,
          y: y - 5,
          duration: 2000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: containerRef.current,
      backgroundColor: '#0a0a0a',
      scene: OfficeScene,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Update agent animations based on task statuses
  useEffect(() => {
    if (!gameRef.current) return;

    const scene = gameRef.current.scene.getScene('OfficeScene') as any;
    if (!scene) return;

    // Group tasks by agent and get latest status
    const agentStatuses = new Map<string, string>();
    tasks.forEach((task) => {
      const current = agentStatuses.get(task.agent_role);
      if (!current || task.status === 'working') {
        agentStatuses.set(task.agent_role, task.status);
      }
    });

    // Update each agent
    agentStatuses.forEach((status, agentRole) => {
      scene.updateAgentStatus(agentRole, status);
    });
  }, [tasks]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ minHeight: '400px' }}
    />
  );
}
