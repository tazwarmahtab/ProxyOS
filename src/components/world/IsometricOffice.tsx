'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Skin } from '@/lib/shared/skins';

interface IsometricOfficeProps {
  geometry: any;
  activeSkin: Skin;
}

export function IsometricOffice({ geometry, activeSkin }: IsometricOfficeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  useEffect(() => {
    if (!containerRef.current || !geometry) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    sceneRef.current = scene;

    // Camera (isometric)
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const aspect = width / height;
    const d = 20;
    const camera = new THREE.OrthographicCamera(
      -d * aspect,
      d * aspect,
      d,
      -d,
      0.1,
      1000
    );
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(30, 30);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Walls (simple)
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 15),
      wallMaterial
    );
    backWall.position.set(0, 7.5, -15);
    scene.add(backWall);

    // Desks from geometry
    if (geometry.desks) {
      geometry.desks.forEach((desk: any, idx: number) => {
        const deskGeometry = new THREE.BoxGeometry(2, 0.2, 1);
        const deskMaterial = new THREE.MeshStandardMaterial({
          color: 0x3a3a3a,
        });
        const deskMesh = new THREE.Mesh(deskGeometry, deskMaterial);
        deskMesh.position.set(desk.x, 0.1, desk.z);
        scene.add(deskMesh);

        // Agent placeholder
        const agentGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
        const agentRole = ['minion', 'scout', 'sage', 'proxy'][idx % 4];
        const skinAgent = activeSkin.agents.find((a) => a.role === agentRole);
        const agentColor = skinAgent?.color || 0x4a4a4a;
        const agentMaterial = new THREE.MeshStandardMaterial({ color: agentColor });
        const agentMesh = new THREE.Mesh(agentGeometry, agentMaterial);
        agentMesh.position.set(desk.x, 0.7, desk.z);
        scene.add(agentMesh);
      });
    }

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      const aspect = width / height;
      camera.left = -d * aspect;
      camera.right = d * aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [geometry, activeSkin]);

  return <div ref={containerRef} className="h-full w-full" />;
}
