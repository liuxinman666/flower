import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

interface ParticleCanvasProps {
  imageSrc?: string | null;
}

// Counts - INCREASED DENSITY
const FLOWER_COUNT = 150000;
const BG_COUNT = 30000;
const PARTICLE_COUNT = FLOWER_COUNT + BG_COUNT;

// Reserved for fireworks
const FIREWORK_PARTICLES_COUNT = 25000; 
// Start fireworks after the flower to avoid eating petals. Eat background instead.
const FIREWORK_PARTICLES_START = FLOWER_COUNT; 

// HUD Constants
const FONT_MONO = "10px 'Courier New', monospace";
const COLOR_HUD_TEXT = "rgba(200, 255, 255, 0.9)";
const COLOR_HUD_BG = "rgba(0, 10, 20, 0.6)";
const COLOR_SKELETON = "rgba(255, 255, 255, 0.8)"; 
const COLOR_GALAXY = "#E0FFFF"; // Light Cyan for galaxy
const COLOR_MAGIC = "#FFD700"; // Golden Yellow for Magic

// NEW: Helper to create a soft ethereal glow texture
const createGlowTexture = () => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; 
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();
  
  const cx = size / 2;
  const cy = size / 2;

  // 1. Soft Core Gradient (Bokeh effect)
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)'); // Bright Core
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)'); // Inner Glow
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)'); // Soft Falloff
  gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');         // Fade to transparent
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  // 2. Subtle Star/Diamond Sparkle (Adds "Magic" feel)
  ctx.globalCompositeOperation = 'lighter'; // Additive blend for the sparkle
  const spikeLen = size * 0.8; // Length of rays
  const spikeW = size * 0.12;   // Width of rays
  
  const drawSpike = (angle: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      // Draw a slender diamond shape
      ctx.moveTo(0, -spikeLen/2);
      ctx.bezierCurveTo(spikeW/2, -spikeLen/6, spikeW/2, spikeLen/6, 0, spikeLen/2);
      ctx.bezierCurveTo(-spikeW/2, spikeLen/6, -spikeW/2, -spikeLen/6, 0, -spikeLen/2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // Faint sparkle
      ctx.fill();
      ctx.restore();
  };

  // Draw vertical and horizontal rays
  drawSpike(0);
  drawSpike(Math.PI / 2);

  const texture = new THREE.CanvasTexture(canvas);
  // texture.premultiplyAlpha = true; // Often helpful for additive blending, but defaults work well too
  return texture;
};

// Firework Logic Interfaces
interface Spark {
    headIdx: number;
    trailIndices: number[]; // Array of indices following the head
}

interface Firework {
    id: number;
    age: number;
    color: THREE.Color;
    sparks: Spark[]; 
}

const ParticleCanvas: React.FC<ParticleCanvasProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  
  // Three.js Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const groupRef = useRef<THREE.Group | null>(null); // Group for rotation
  const materialRef = useRef<THREE.PointsMaterial | null>(null);
  
  // Interaction Refs
  const pointerRef = useRef(new THREE.Vector2(9999, 9999)); // Screen Coords
  const raycasterRef = useRef(new THREE.Raycaster());
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)); // Z=0 plane for intersection
  const mouseWorldPosRef = useRef(new THREE.Vector3(9999, 9999, 9999));
  
  // HUD Refs
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const logsRef = useRef<string[]>([]);
  
  // Logic Refs
  const lotusPositionsRef = useRef<Float32Array | null>(null);
  const galaxyPositionsRef = useRef<Float32Array | null>(null); 
  const magicPositionsRef = useRef<Float32Array | null>(null); // NEW: Magic Shield
  const currentPositionsRef = useRef<Float32Array | null>(null);
  
  const lotusColorsRef = useRef<Float32Array | null>(null);
  const galaxyColorsRef = useRef<Float32Array | null>(null);
  const magicColorsRef = useRef<Float32Array | null>(null); // NEW: Magic Colors
  
  const driftRef = useRef<Float32Array | null>(null);
  const bgSpeedsRef = useRef<Float32Array | null>(null);
  
  const frameIdRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  
  // State Refs
  const isGalaxyModeRef = useRef(false);
  const isMagicModeRef = useRef(false); // NEW
  const galaxyTransitionRef = useRef(0); 
  const magicTransitionRef = useRef(0); // NEW
  const magicModeDebounceRef = useRef(0); // For smooth activation
  
  const rotationRef = useRef({ x: 0, y: 0 });
  const prevLeftHandRef = useRef<{x: number, y: number} | null>(null);
  const handFactorRef = useRef(0); 

  // Fireworks System
  const fireworksRef = useRef<Firework[]>([]);
  const lastFireworkTimeRef = useRef(0);
  const fireworkCursorRef = useRef(FIREWORK_PARTICLES_START);

  const allocateParticles = (count: number) => {
      const indices: number[] = [];
      let ptr = fireworkCursorRef.current;
      for (let i=0; i<count; i++) {
          indices.push(ptr);
          ptr++;
          // Wrap around if we exceed particle count or buffer limit
          // We limit it to the BG/Firework zone
          if (ptr >= PARTICLE_COUNT) {
              ptr = FIREWORK_PARTICLES_START;
          }
      }
      fireworkCursorRef.current = ptr;
      return indices;
  };

  // Reusable function to spawn a firework at a 3D location
  const spawnFirework = (position: THREE.Vector3) => {
      const fwId = Date.now();
      const TRAIL_LEN = 12;
      const SPARK_CNT = 50; 
      
      const totalNeeded = SPARK_CNT * (1 + TRAIL_LEN);
      const indices = allocateParticles(totalNeeded);
      
      const sparks: Spark[] = [];
      let idxPtr = 0;
      const baseColor = new THREE.Color().setHSL(Math.random(), 1.0, 0.6);

      for(let k=0; k<SPARK_CNT; k++) {
          if (idxPtr >= indices.length) break;
          const headIdx = indices[idxPtr++];
          const trailIndices = [];
          for(let t=0; t<TRAIL_LEN; t++) {
              if (idxPtr < indices.length) trailIndices.push(indices[idxPtr++]);
          }
          
          sparks.push({ headIdx, trailIndices });
          
          // Init physics
          const curr = currentPositionsRef.current!;
          const drifts = driftRef.current!; 
          const cols = geometryRef.current!.attributes.color.array as Float32Array;
          
          // Velocity (Head only need vel, trail follows)
          const speed = 0.03 + Math.random() * 0.05;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI;
          
          const vx = speed * Math.sin(phi) * Math.cos(theta);
          const vy = speed * Math.sin(phi) * Math.sin(theta);
          const vz = speed * Math.cos(phi);

          // Setup Head
          const h3 = headIdx * 3;
          curr[h3] = position.x; 
          curr[h3+1] = position.y; 
          curr[h3+2] = position.z;
          
          drifts[h3] = vx; drifts[h3+1] = vy; drifts[h3+2] = vz;
          cols[h3] = 1; cols[h3+1] = 1; cols[h3+2] = 1; // Spark is bright white
          
          // Setup Trail (collapsed to start)
          trailIndices.forEach(ti => {
              const t3 = ti * 3;
              curr[t3] = position.x;
              curr[t3+1] = position.y;
              curr[t3+2] = position.z;
              cols[t3] = 0; cols[t3+1] = 0; cols[t3+2] = 0; // Invisible start
          });
      }

      fireworksRef.current.push({
          id: fwId,
          age: 0,
          color: baseColor,
          sparks
      });
      if (geometryRef.current) {
          geometryRef.current.attributes.color.needsUpdate = true;
      }
  };

  const addLog = (msg: string) => {
    const d = new Date();
    const time = d.toLocaleTimeString('en-US', { hour12: false });
    const ms = Math.floor(d.getMilliseconds() / 10).toString().padStart(2, '0');
    logsRef.current.unshift(`[${time}.${ms}] ${msg}`);
    if (logsRef.current.length > 20) logsRef.current.pop();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerRef.current.set(x, y);
  };

  const handleClick = (e: React.MouseEvent) => {
      if (!cameraRef.current) return;
      
      // Update raycaster
      raycasterRef.current.setFromCamera(pointerRef.current, cameraRef.current);
      const target = new THREE.Vector3();
      // Raycast against infinite plane at Z=0
      raycasterRef.current.ray.intersectPlane(planeRef.current, target);
      
      if (target) {
          spawnFirework(target);
          addLog("MOUSE: CLICK BURST");
      }
  };

  useEffect(() => {
    const initVision = async () => {
      addLog("SYS: INIT VISION (2 HANDS)...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
      );
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2 
      });
      addLog("SYS: MODEL LOADED");

      if (navigator.mediaDevices?.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            addLog("SYS: CAM ACTIVE");
        } catch (e) {
            console.error("Webcam error:", e);
            addLog("ERR: CAM FAILED");
        }
      }
    };
    initVision();
  }, []);

  // --- 1. LOTUS GENERATION ---
  const generateLotus = () => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const drift = new Float32Array(PARTICLE_COUNT * 3); 
    const bgSpeeds = new Float32Array(PARTICLE_COUNT * 3);
    
    const colorPod = new THREE.Color('#FFD700'); 
    const colorPodSide = new THREE.Color('#9ACD32'); 
    const colorPetalInner = new THREE.Color('#E0FFFF'); 
    const colorPetalMid = new THREE.Color('#FF69B4'); 
    const colorPetalTip = new THREE.Color('#C71585'); 
    const colorVeinShadow = new THREE.Color('#DB7093'); 

    let pIndex = 0;

    // Pod
    const podCount = 10000; 
    for (let i = 0; i < podCount; i++) {
        const topRadius = 0.35;
        const bottomRadius = 0.15;
        const height = 0.35;
        const rSq = Math.random();
        const r = Math.sqrt(rSq) * topRadius;
        const theta = Math.random() * Math.PI * 2;
        let x, y, z;
        let c = new THREE.Color();

        if (Math.random() > 0.4) {
            x = r * Math.cos(theta);
            z = r * Math.sin(theta);
            y = height / 2 + (Math.random() * 0.05); 
            const distFromCenter = Math.sqrt(x*x + z*z);
            if (distFromCenter < 0.25 && Math.random() > 0.8) {
               c.setHex(0x556B2F); 
               y -= 0.02;
            } else {
               c.copy(colorPod).lerp(new THREE.Color('#FFFACD'), Math.random() * 0.5);
            }
        } else {
            const h = Math.random(); 
            const radAtH = bottomRadius + (topRadius - bottomRadius) * h;
            x = radAtH * Math.cos(theta);
            z = radAtH * Math.sin(theta);
            y = (h - 0.5) * height;
            c.copy(colorPodSide);
        }

        const ix = pIndex * 3;
        positions[ix] = x; positions[ix+1] = y + 0.1; positions[ix+2] = z;
        colors[ix] = c.r; colors[ix+1] = c.g; colors[ix+2] = c.b;
        drift[ix] = Math.random() * Math.PI * 2; 
        drift[ix+1] = 0.002; 
        pIndex++;
    }

    // Petals
    const layers = [
        { count: 6,  off: 0.0, len: 0.8, wid: 0.45, tilt: 0.25, curve: 0.2, y: 0.18 },
        { count: 9,  off: 0.5, len: 1.1, wid: 0.65, tilt: 0.55, curve: 0.4, y: 0.16 },
        { count: 12, off: 0.0, len: 1.5, wid: 0.9, tilt: 0.95, curve: 0.7, y: 0.14 },
        { count: 16, off: 0.5, len: 1.8, wid: 1.0, tilt: 1.25, curve: 0.5, y: 0.10 },
        { count: 20, off: 0.0, len: 2.1, wid: 1.1, tilt: 1.55, curve: 0.3, y: 0.06 },
    ];
    const totalPetalParticles = FLOWER_COUNT - pIndex;
    const particlesPerLayer = Math.floor(totalPetalParticles / layers.length);

    layers.forEach((layer) => {
        const partsPerPetal = Math.floor(particlesPerLayer / layer.count);
        for (let p = 0; p < layer.count; p++) {
            const angleBase = (p / layer.count) * Math.PI * 2 + layer.off + (Math.random()-0.5)*0.05;
            for (let k = 0; k < partsPerPetal; k++) {
                if (pIndex >= FLOWER_COUNT) break;
                let u = (Math.random() - 0.5);
                let v = Math.random();
                const shapeBase = Math.sin(v * Math.PI);
                const shapeFactor = Math.pow(shapeBase, 0.75); 
                const actualWidth = layer.wid * shapeFactor;
                const veinFreq = 12; 
                const veinPhase = u * Math.PI * veinFreq;
                const veinHeight = Math.cos(veinPhase) * 0.015; 
                const thickness = (Math.random() - 0.5) * 0.04;
                const curl = Math.pow(Math.abs(u * 2), 2.2) * 0.25; 
                const curve = Math.pow(v, 1.4) * layer.curve;
                let px = u * actualWidth;
                let py = v * layer.len;
                let pz = curl + curve * 0.5 + veinHeight + thickness; 
                const cosT = Math.cos(layer.tilt);
                const sinT = Math.sin(layer.tilt);
                let ry = py * cosT - pz * sinT;
                let rz = py * sinT + pz * cosT; 
                rz += 0.35; 
                const cosA = Math.cos(angleBase);
                const sinA = Math.sin(angleBase);
                const finalX = px * cosA + rz * sinA;
                const finalZ = -px * sinA + rz * cosA;
                const finalY = ry + layer.y - 0.5;

                const ix = pIndex * 3;
                positions[ix] = finalX; positions[ix+1] = finalY; positions[ix+2] = finalZ;
                let c = new THREE.Color();
                if (v < 0.25) c.copy(colorPetalInner).lerp(colorPetalMid, v * 4.0);
                else if (v < 0.85) c.copy(colorPetalMid);
                else c.copy(colorPetalMid).lerp(colorPetalTip, (v - 0.85) * 6.6);
                if (veinHeight < -0.005) c.lerp(colorVeinShadow, 0.4);
                if (Math.abs(u) > 0.45) c.lerp(colorPetalTip, 0.5);
                c.offsetHSL(0, 0, (Math.random()-0.5)*0.06);
                colors[ix] = c.r; colors[ix+1] = c.g; colors[ix+2] = c.b;
                drift[ix] = angleBase + v * Math.PI; 
                drift[ix+1] = 0.002 + Math.pow(v, 2.5) * 0.025; 
                drift[ix+2] = Math.random(); 
                pIndex++;
            }
        }
    });

    // Background
    for (let i = pIndex; i < PARTICLE_COUNT; i++) {
        const ix = i * 3;
        const range = 25; 
        positions[ix] = (Math.random() - 0.5) * range;
        positions[ix+1] = (Math.random() - 0.5) * range;
        positions[ix+2] = (Math.random() - 0.5) * range;
        bgSpeeds[ix] = (Math.random() - 0.5) * 0.01;
        bgSpeeds[ix+1] = (Math.random() * 0.02) + 0.005; 
        bgSpeeds[ix+2] = (Math.random() - 0.5) * 0.01;
        const c = colorPetalInner.clone().multiplyScalar(0.5);
        colors[ix] = c.r; colors[ix+1] = c.g; colors[ix+2] = c.b;
        drift[ix] = Math.random() * 10;
        drift[ix+1] = 0.008; 
    }

    return { positions, colors, drift, bgSpeeds };
  };

  // --- 2. GALAXY GENERATION ---
  const generateGalaxy = () => {
      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const colors = new Float32Array(PARTICLE_COUNT * 3);
      const col1 = new THREE.Color("#4B0082"); // Indigo
      const col2 = new THREE.Color("#00FFFF"); // Cyan
      const col3 = new THREE.Color("#FFFFFF"); // White
      const colStar = new THREE.Color("#E0E0FF"); // Pale Blue-White for stars

      for (let i = 0; i < PARTICLE_COUNT; i++) {
          const ix = i * 3;
          
          // Secondary Layer: Twinkling Star Field (~15% of particles)
          // We pick indices divisible by 7 to scatter them randomly throughout the buffer
          if (i % 7 === 0) {
              // Create a halo/ellipsoid of stars around the galaxy
              const theta = Math.random() * Math.PI * 2;
              const costheta = Math.random() * 2 - 1;
              const phi = Math.acos(costheta);
              // Distribute stars further out: 4.0 to 14.0 radius
              const r = 4.0 + Math.pow(Math.random(), 1.5) * 10.0; 
              
              const x = r * Math.sin(phi) * Math.cos(theta);
              const y = (r * Math.sin(phi) * Math.sin(theta)) * 0.4; // Flattened Y plane
              const z = r * Math.cos(phi);
              
              positions[ix] = x; positions[ix+1] = y; positions[ix+2] = z;
              
              // Color variation for stars
              const starType = Math.random();
              if (starType > 0.95) {
                 colors[ix] = 1.0; colors[ix+1] = 0.8; colors[ix+2] = 0.4; // Gold/Yellow star
              } else if (starType > 0.85) {
                 colors[ix] = 0.6; colors[ix+1] = 0.8; colors[ix+2] = 1.0; // Blue star
              } else {
                 colors[ix] = colStar.r; colors[ix+1] = colStar.g; colors[ix+2] = colStar.b;
              }
          } else {
              // Main Galaxy Spiral Arms
              const armIndex = i % 3;
              const r = Math.pow(Math.random(), 0.5) * 8; 
              const spin = 3.0; 
              const angle = r * spin + (armIndex * (Math.PI * 2 / 3)) + Math.random() * 0.5;
              const x = r * Math.cos(angle);
              const z = r * Math.sin(angle);
              const y = Math.sin(r * 1.5) * 0.5 * Math.exp(-r * 0.1) + (Math.random()-0.5)*0.2;
              positions[ix] = x; positions[ix+1] = y; positions[ix+2] = z;
              
              let c = new THREE.Color();
              if (r < 2) c.copy(col3).lerp(col2, r/2);
              else c.copy(col2).lerp(col1, (r-2)/6);
              c.offsetHSL(0, 0, Math.random() * 0.2); 
              colors[ix] = c.r; colors[ix+1] = c.g; colors[ix+2] = c.b;
          }
      }
      return { positions, colors };
  };

  // --- 3. MAGIC SHIELD GENERATION (COMPLEX GOLD) ---
  const generateMagicShield = () => {
      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const colors = new Float32Array(PARTICLE_COUNT * 3);
      
      const colGold = new THREE.Color("#FFD700"); 
      const colOrange = new THREE.Color("#FFA500");
      const colWhite = new THREE.Color("#FFFFFF"); 
      const colDark = new THREE.Color("#B8860B"); // Dark Goldenrod

      let pIndex = 0;

      const addP = (x: number, y: number, z: number, c: THREE.Color) => {
          if (pIndex >= PARTICLE_COUNT) return;
          const ix = pIndex * 3;
          positions[ix] = x; positions[ix+1] = y; positions[ix+2] = z;
          colors[ix] = c.r; colors[ix+1] = c.g; colors[ix+2] = c.b;
          pIndex++;
      };

      // 1. Outer Decorated Ring (Thick, varying radius)
      const countRing = Math.floor(PARTICLE_COUNT * 0.35);
      for(let i=0; i<countRing; i++) {
          const theta = (i / countRing) * Math.PI * 2 * 3; // Loop 3 times for density
          // Ornate border: slight sine wave modulation
          const rBase = 2.2;
          const rVar = Math.cos(theta * 12) * 0.08 + Math.cos(theta * 60) * 0.02; 
          const r = rBase + rVar + (Math.random()-0.5)*0.06;
          
          const x = r * Math.cos(theta);
          const y = r * Math.sin(theta);
          const z = (Math.random()-0.5) * 0.02;
          
          const c = colGold.clone().lerp(colOrange, Math.random() * 0.4);
          addP(x, y, z, c);
      }

      // 2. Hexagram (Two Triangles)
      const countStar = Math.floor(PARTICLE_COUNT * 0.25);
      for(let i=0; i<countStar; i++) {
          const tri = Math.random() > 0.5 ? 0 : 1; 
          const edge = Math.floor(Math.random() * 3); 
          const t = Math.random(); 
          
          const angleOffset = tri === 0 ? 0 : (Math.PI / 3);
          const a1 = angleOffset + edge * (Math.PI * 2 / 3);
          const a2 = angleOffset + ((edge + 1) % 3) * (Math.PI * 2 / 3);
          
          const r = 2.1;
          const x1 = r * Math.cos(a1); const y1 = r * Math.sin(a1);
          const x2 = r * Math.cos(a2); const y2 = r * Math.sin(a2);
          
          const x = x1 + (x2 - x1) * t;
          const y = y1 + (y2 - y1) * t;
          
          // Thickness and glow
          const spread = (Math.random()-0.5) * 0.08;
          addP(x + spread, y + spread, 0, colGold);
      }

      // 3. Inner Runes Ring
      const countRunes = Math.floor(PARTICLE_COUNT * 0.20);
      for(let i=0; i<countRunes; i++) {
          const r = 1.4 + (Math.random()-0.5) * 0.15;
          const theta = Math.random() * Math.PI * 2;
          // Segments for runes
          if (Math.sin(theta * 32) > 0.0) {
              const x = r * Math.cos(theta);
              const y = r * Math.sin(theta);
              addP(x, y, 0, colDark);
          } else {
             // Fill voids with faint dust
             addP(0,0,0, colWhite); // Will be overwritten by next step or just center glow
             pIndex--; // Hack to retry slot for center
          }
      }

      // 4. Center Complexity (Spiral + Core)
      while(pIndex < PARTICLE_COUNT) {
          const t = Math.random(); 
          // Spiral arms
          if (Math.random() > 0.3) {
             const arm = Math.floor(Math.random() * 5);
             const theta = t * Math.PI * 2 + (arm * Math.PI * 2 / 5) + t * 2.0;
             const r = t * 1.2;
             const x = r * Math.cos(theta);
             const y = r * Math.sin(theta);
             const c = colGold.clone().lerp(colWhite, t);
             addP(x, y, 0, c);
          } else {
             // Dense Core
             const r = Math.pow(Math.random(), 2) * 0.8;
             const theta = Math.random() * Math.PI * 2;
             addP(r*Math.cos(theta), r*Math.sin(theta), (Math.random()-0.5)*0.2, colWhite);
          }
      }
      
      return { positions, colors };
  };

  // --- INIT & LOOP ---
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.03); 
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 2.2, 3.5); 
    camera.lookAt(0, 0.4, 0); 
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const hudCanvas = document.createElement('canvas');
    hudCanvas.className = "absolute inset-0 pointer-events-none z-20";
    hudCanvas.width = window.innerWidth;
    hudCanvas.height = window.innerHeight;
    containerRef.current.appendChild(hudCanvas);
    hudCanvasRef.current = hudCanvas;

    // Generate Data
    const lotusData = generateLotus();
    const galaxyData = generateGalaxy();
    const magicData = generateMagicShield(); // Generate Magic Data

    lotusPositionsRef.current = lotusData.positions;
    lotusColorsRef.current = lotusData.colors;
    
    galaxyPositionsRef.current = galaxyData.positions;
    galaxyColorsRef.current = galaxyData.colors;

    magicPositionsRef.current = magicData.positions;
    magicColorsRef.current = magicData.colors;

    driftRef.current = lotusData.drift;
    bgSpeedsRef.current = lotusData.bgSpeeds;
    currentPositionsRef.current = new Float32Array(lotusData.positions); 
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(currentPositionsRef.current, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lotusData.colors), 3));
    geometryRef.current = geometry;

    // USE TEXTURE MAP for Ethereal Glow
    const texture = createGlowTexture();
    const material = new THREE.PointsMaterial({
      size: 0.04, // Increased size for texture visibility
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending, 
      depthWrite: false,
    });
    materialRef.current = material;

    const group = new THREE.Group();
    const points = new THREE.Points(geometry, material);
    group.add(points);
    scene.add(group);
    
    particlesRef.current = points;
    groupRef.current = group;

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      const timeNow = performance.now();

      // --- SENSOR LOGIC ---
      let rightHandBloom = false;
      let rightHandPinching = false;
      let leftHandOpen = false;
      let handsTogether = false;
      let magicGestureDetected = false;
      let rightHandPos = new THREE.Vector3();

      if (handLandmarkerRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        if (videoRef.current.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = videoRef.current.currentTime;
            const results = handLandmarkerRef.current.detectForVideo(videoRef.current, timeNow);
            
            let rightHandLandmarks: any = null;
            let leftHandLandmarks: any = null;

            if (results.landmarks && results.handedness) {
                results.handedness.forEach((h, index) => {
                    const label = h[0].displayName; 
                    if (label === "Right") rightHandLandmarks = results.landmarks[index];
                    if (label === "Left") leftHandLandmarks = results.landmarks[index];
                });
            }

            // 0. MAGIC GESTURE CHECK (Highest Priority)
            if (rightHandLandmarks && leftHandLandmarks) {
                const isSwordFinger = (lm: any) => {
                    const wrist = lm[0];
                    const indexTip = lm[8]; const indexPip = lm[6];
                    const middleTip = lm[12]; const middlePip = lm[10];
                    const ringTip = lm[16]; const ringPip = lm[14];
                    const pinkyTip = lm[20]; const pinkyPip = lm[18];

                    const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
                    const idxExt = dist(indexTip, wrist) > dist(indexPip, wrist);
                    const midExt = dist(middleTip, wrist) > dist(middlePip, wrist);
                    
                    const ringCurl = dist(ringTip, wrist) < dist(ringPip, wrist) * 1.6; 
                    const pinkyCurl = dist(pinkyTip, wrist) < dist(pinkyPip, wrist) * 1.6;
                    
                    const tipsClose = dist(indexTip, middleTip) < 0.15;

                    return idxExt && midExt && ringCurl && pinkyCurl && tipsClose;
                };

                const rightSword = isSwordFinger(rightHandLandmarks);
                const leftSword = isSwordFinger(leftHandLandmarks);

                if (rightSword && leftSword) {
                     const getVector = (lm: any) => {
                         return { x: lm[8].x - lm[0].x, y: lm[8].y - lm[0].y };
                     };
                     const vR = getVector(rightHandLandmarks);
                     const vL = getVector(leftHandLandmarks);
                     
                     const magR = Math.hypot(vR.x, vR.y);
                     const magL = Math.hypot(vL.x, vL.y);
                     const dot = (vR.x * vL.x + vR.y * vL.y) / (magR * magL);
                     
                     const isCrossed = Math.abs(dot) < 0.85;

                     const distWrists = Math.hypot(rightHandLandmarks[0].x - leftHandLandmarks[0].x, rightHandLandmarks[0].y - leftHandLandmarks[0].y);
                     
                     if (isCrossed && distWrists < 0.35) {
                         magicGestureDetected = true;
                     }
                }
            }

            // Smooth State Transition (Debounce)
            if (magicGestureDetected) {
                magicModeDebounceRef.current = Math.min(magicModeDebounceRef.current + 1, 10);
            } else {
                magicModeDebounceRef.current = Math.max(magicModeDebounceRef.current - 1, 0);
            }

            if (magicModeDebounceRef.current > 6) {
                isMagicModeRef.current = true;
                isGalaxyModeRef.current = false;
            } else if (magicModeDebounceRef.current < 2) {
                isMagicModeRef.current = false;
            }

            // 1. Right Hand: Bloom & Fireworks (Only if not magic)
            if (rightHandLandmarks && !isMagicModeRef.current) {
                const thumb = rightHandLandmarks[4];
                const index = rightHandLandmarks[8];
                const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
                
                rightHandPos.set((0.5 - index.x) * 5, (0.5 - index.y) * 4 + 1.0, 0);

                if (dist < 0.04) {
                    rightHandPinching = true;
                    if (timeNow - lastFireworkTimeRef.current > 250) {
                        lastFireworkTimeRef.current = timeNow;
                        spawnFirework(rightHandPos);
                    }
                }

                let target = (dist - 0.03) * 8.0; 
                target = Math.max(0, Math.min(2.5, target)); 
                handFactorRef.current += (target - handFactorRef.current) * 0.2;

                if (handFactorRef.current > 0.5) rightHandBloom = true;
            } else {
                if (!rightHandLandmarks) handFactorRef.current += (0 - handFactorRef.current) * 0.05;
            }

            // 2. Left Hand Rotate
            if (leftHandLandmarks && !isMagicModeRef.current) {
                const thumb = leftHandLandmarks[4];
                const index = leftHandLandmarks[8];
                const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
                if (dist > 0.08) {
                    leftHandOpen = true;
                    const cx = leftHandLandmarks[9].x; 
                    const cy = leftHandLandmarks[9].y;
                    
                    if (prevLeftHandRef.current) {
                        const dx = cx - prevLeftHandRef.current.x;
                        const dy = cy - prevLeftHandRef.current.y;
                        rotationRef.current.y -= dx * 7.0; 
                        rotationRef.current.x -= dy * 5.0; 
                    }
                    prevLeftHandRef.current = {x: cx, y: cy};
                } else {
                    prevLeftHandRef.current = null;
                }
            }

            // 3. Galaxy (Palms Merged & Pinkies Touch) - Only if not Magic
            if (leftHandLandmarks && rightHandLandmarks && !isMagicModeRef.current) {
                const lw = leftHandLandmarks[0]; 
                const rw = rightHandLandmarks[0];
                const lp = leftHandLandmarks[20]; // Left Pinky Tip
                const rp = rightHandLandmarks[20]; // Right Pinky Tip

                const distWrists = Math.hypot(lw.x - rw.x, lw.y - rw.y);
                const distPinkies = Math.hypot(lp.x - rp.x, lp.y - rp.y);

                if (distWrists < 0.25 && distPinkies < 0.08) {
                    handsTogether = true;
                    isGalaxyModeRef.current = true;
                } else {
                    isGalaxyModeRef.current = false;
                }
            } else if (!isMagicModeRef.current) {
                isGalaxyModeRef.current = false;
            }

            // HUD Drawing
            const ctx = hudCanvasRef.current?.getContext('2d');
            if (ctx && hudCanvasRef.current) {
                ctx.clearRect(0, 0, hudCanvasRef.current.width, hudCanvasRef.current.height);
                const w = hudCanvasRef.current.width;
                const h = hudCanvasRef.current.height;

                ctx.fillStyle = COLOR_HUD_BG; ctx.fillRect(0, 0, 250, h);
                ctx.fillStyle = "#FFF"; ctx.font = "bold 14px 'Courier New'"; ctx.fillText("INTERACTION OS", 15, 30);
                
                const yStart = 60; const lineH = 18;
                ctx.font = FONT_MONO; ctx.fillStyle = COLOR_HUD_TEXT;
                
                let modeStr = "LOTUS (STD)";
                if (isMagicModeRef.current) modeStr = "MAGIC (DR.S)";
                else if (isGalaxyModeRef.current) modeStr = "GALAXY (SYNC)";
                
                ctx.fillText(`MODE: ${modeStr}`, 15, yStart);
                ctx.fillText(`ROTATION: ${rotationRef.current.y.toFixed(2)} rad`, 15, yStart + lineH);
                ctx.fillText(`BLOOM FACTOR: ${(handFactorRef.current * 100).toFixed(0)}%`, 15, yStart + lineH * 2);
                
                ctx.fillStyle = rightHandBloom ? "#F0F" : "#333";
                ctx.fillText(rightHandBloom ? "● R-HAND: BLOOM" : "○ R-HAND: FORM", 15, yStart + lineH * 4);
                
                ctx.fillStyle = rightHandPinching ? "#FF0" : "#333";
                ctx.fillText(rightHandPinching ? "● R-PINCH: FIREWORK" : "○ R-PINCH: IDLE", 15, yStart + lineH * 5);
                
                ctx.fillStyle = leftHandOpen ? "#0FF" : "#333";
                ctx.fillText(leftHandOpen ? "● L-MOVE: ROTATE" : "○ L-MOVE: IDLE", 15, yStart + lineH * 6);
                
                ctx.fillStyle = handsTogether ? COLOR_GALAXY : "#333";
                ctx.fillText(handsTogether ? "● PALMS: MERGED" : "○ PALMS: APART", 15, yStart + lineH * 7);

                ctx.fillStyle = magicGestureDetected ? COLOR_MAGIC : "#333";
                ctx.fillText(magicGestureDetected ? "● MAGIC: ACTIVE" : "○ MAGIC: INACTIVE", 15, yStart + lineH * 8);

                const drawHand = (hand: any, color: string) => {
                     const joints = [[0,1,2,3,4], [0,5,6,7,8], [9,10,11,12], [13,14,15,16], [0,17,18,19,20]];
                     ctx.strokeStyle = color;
                     ctx.lineWidth = 2;
                     ctx.beginPath();
                     joints.forEach(chain => {
                        for(let j=0; j<chain.length-1; j++) {
                            const p1 = hand[chain[j]]; const p2 = hand[chain[j+1]];
                            ctx.moveTo((1-p1.x)*w, p1.y*h); ctx.lineTo((1-p2.x)*w, p2.y*h);
                        }
                     });
                     ctx.stroke();
                };

                if (leftHandLandmarks) {
                    drawHand(leftHandLandmarks, leftHandOpen ? "#0FF" : (magicGestureDetected ? COLOR_MAGIC : (handsTogether ? COLOR_GALAXY : COLOR_SKELETON)));
                }
                if (rightHandLandmarks) {
                    drawHand(rightHandLandmarks, rightHandPinching ? "#FF0" : (magicGestureDetected ? COLOR_MAGIC : (handsTogether ? COLOR_GALAXY : (rightHandBloom ? "#F0F" : COLOR_SKELETON))));
                }

                logsRef.current.forEach((log, i) => {
                    ctx.fillStyle = `rgba(150, 255, 200, ${1 - i/20})`;
                    ctx.fillText(log, 15, h - 200 + i*12);
                });
            }
        }
      }

      // --- PHYSICS & ANIMATION ---
      if (geometryRef.current && currentPositionsRef.current) {
         // 1. Mode Transitions
         const targetGalaxy = isGalaxyModeRef.current ? 1.0 : 0.0;
         galaxyTransitionRef.current += (targetGalaxy - galaxyTransitionRef.current) * 0.08;
         const gT = galaxyTransitionRef.current;

         const targetMagic = isMagicModeRef.current ? 1.0 : 0.0;
         magicTransitionRef.current += (targetMagic - magicTransitionRef.current) * 0.1; // Fast transition for Magic
         const mT = magicTransitionRef.current;
         
         // 2. Camera Zoom (Magic mode zooms out slightly to see whole shield)
         let targetCamZ = 3.5 - (gT * 1.5);
         if (mT > 0.1) targetCamZ = 4.5; // Zoom out for magic
         cameraRef.current!.position.z += (targetCamZ - cameraRef.current!.position.z) * 0.1;

         // 3. Rotation Logic
         if (isMagicModeRef.current) {
             // Face front for Magic Shield
             groupRef.current!.rotation.x += (0 - groupRef.current!.rotation.x) * 0.1;
             groupRef.current!.rotation.y += (0 - groupRef.current!.rotation.y) * 0.1;
             // Slight wobble
             groupRef.current!.rotation.z = Math.sin(timeNow * 0.002) * 0.05;
         } else if (isGalaxyModeRef.current) {
             groupRef.current!.rotation.y += 0.005;
             groupRef.current!.rotation.z = Math.sin(timeNow * 0.001) * 0.2; 
         } else {
             groupRef.current!.rotation.y += (rotationRef.current.y - groupRef.current!.rotation.y) * 0.1;
             groupRef.current!.rotation.x += (rotationRef.current.x - groupRef.current!.rotation.x) * 0.1;
             groupRef.current!.rotation.z *= 0.95; 
         }

         // 4. Update Mouse Position in 3D
         // This translates the 2D mouse coords into a 3D point on the Z=0 plane
         if (cameraRef.current) {
             raycasterRef.current.setFromCamera(pointerRef.current, cameraRef.current);
             raycasterRef.current.ray.intersectPlane(planeRef.current, mouseWorldPosRef.current);
         }

         // 5. Particle Update
         const curr = currentPositionsRef.current;
         const lotusPos = lotusPositionsRef.current!;
         const galPos = galaxyPositionsRef.current!;
         const magPos = magicPositionsRef.current!;
         
         const lotusCol = lotusColorsRef.current!;
         const galCol = galaxyColorsRef.current!;
         const magCol = magicColorsRef.current!;
         
         const currCol = geometryRef.current.attributes.color.array as Float32Array;
         const drifts = driftRef.current!;

         const activeFireworkIndices = new Set<number>();
         
         // FIREWORKS UPDATE (With Trails)
         fireworksRef.current = fireworksRef.current.filter(fw => {
             fw.age++;
             const gravity = 0.004;
             const drag = 0.96;
             const trailFadeRate = 0.92; // How fast trails fade

             fw.sparks.forEach(spark => {
                 const headI = spark.headIdx * 3;
                 // Mark as active so main loop doesn't overwrite
                 activeFireworkIndices.add(spark.headIdx);
                 spark.trailIndices.forEach(ti => activeFireworkIndices.add(ti));
                 
                 // 1. Capture previous Head Pos for trail leader
                 const prevHX = curr[headI];
                 const prevHY = curr[headI+1];
                 const prevHZ = curr[headI+2];

                 // 2. Physics for Head
                 drifts[headI+1] -= gravity; 
                 drifts[headI] *= drag; drifts[headI+1] *= drag; drifts[headI+2] *= drag;
                 curr[headI] += drifts[headI]; 
                 curr[headI+1] += drifts[headI+1]; 
                 curr[headI+2] += drifts[headI+2];
                 
                 // Head Color (Fade out slowly)
                 const lifeRatio = Math.max(0, 1 - fw.age / 90);
                 currCol[headI] = fw.color.r;
                 currCol[headI+1] = fw.color.g;
                 currCol[headI+2] = fw.color.b; // Keep head bright

                 // 3. Propagate Trail (Snake)
                 for(let t = spark.trailIndices.length - 1; t > 0; t--) {
                     const currT = spark.trailIndices[t] * 3;
                     const prevT = spark.trailIndices[t-1] * 3;
                     
                     // Shift Position
                     curr[currT] = curr[prevT];
                     curr[currT+1] = curr[prevT+1];
                     curr[currT+2] = curr[prevT+2];
                     
                     // Color Fade
                     // Interpolate between head color and invisible
                     const tRatio = t / spark.trailIndices.length;
                     const intensity = lifeRatio * (1 - tRatio) * 0.8;
                     currCol[currT] = fw.color.r * intensity;
                     currCol[currT+1] = fw.color.g * intensity;
                     currCol[currT+2] = fw.color.b * intensity;
                 }
                 
                 // 4. Connect first trail to Head's old pos
                 if(spark.trailIndices.length > 0) {
                     const t0 = spark.trailIndices[0] * 3;
                     curr[t0] = prevHX;
                     curr[t0+1] = prevHY;
                     curr[t0+2] = prevHZ;
                     currCol[t0] = fw.color.r * lifeRatio * 0.9;
                     currCol[t0+1] = fw.color.g * lifeRatio * 0.9;
                     currCol[t0+2] = fw.color.b * lifeRatio * 0.9;
                 }
             });

             return fw.age < 90; 
         });

         const bloomFactor = handFactorRef.current;
         const bloomScale = 1 + bloomFactor * 2.0;
         const bloomSpread = bloomFactor * 2.5;

         // Rotators for Magic Ring Animation
         const spin1 = timeNow * 0.0005; // Slow Outer
         const spin2 = -timeNow * 0.001; // Medium Inner
         const spin3 = timeNow * 0.002;  // Fast Core

         // Mouse Interaction Coords
         const mx = mouseWorldPosRef.current.x;
         const my = mouseWorldPosRef.current.y;
         const mz = mouseWorldPosRef.current.z;

         for(let i=0; i<PARTICLE_COUNT; i++) {
             if (activeFireworkIndices.has(i)) continue;

             const ix = i * 3;

             // Targets
             const lx = lotusPos[ix]; const ly = lotusPos[ix+1]; const lz = lotusPos[ix+2];
             const gx = galPos[ix];   const gy = galPos[ix+1];   const gz = galPos[ix+2];
             const mx_t = magPos[ix]; const my_t = magPos[ix+1]; const mz_t = magPos[ix+2]; // renamed to avoid conflict

             // 1. Calculate Intermediate (Lotus -> Galaxy)
             let tx = lx + (gx - lx) * gT;
             let ty = ly + (gy - ly) * gT;
             let tz = lz + (gz - lz) * gT;

             // Bloom (If not Galaxy)
             if (!isGalaxyModeRef.current && bloomFactor > 0.05 && mT < 0.1) {
                 const influence = 1 - gT; 
                 const scale = 1 + (bloomScale - 1) * influence;
                 const spread = bloomSpread * influence;
                 tx = tx * scale + (Math.random()-0.5) * spread * 0.5;
                 ty = ty * scale + (Math.random()-0.5) * spread * 0.5;
                 tz = tz * scale + (Math.random()-0.5) * spread * 0.5;
             }
             if (!isGalaxyModeRef.current && bloomFactor < 0.1 && mT < 0.1) {
                 const phase = drifts[ix]; 
                 const amp = drifts[ix+1]; 
                 const freq = 0.0008; 
                 tx += Math.sin(timeNow * freq + phase) * amp;
                 ty += Math.cos(timeNow * freq + phase * 0.5) * amp;
                 tz += Math.sin(timeNow * freq * 1.2 + phase) * amp;
             }

             // 2. Magic Shield Transform (Spinning logic)
             // We apply spin to the magic target position before lerping
             let finalMx = mx_t;
             let finalMy = my_t;
             const finalMz = mz_t;

             // Only calculate rotation if Magic is blending in
             if (mT > 0.01) {
                 const dist = Math.sqrt(mx_t*mx_t + my_t*my_t);
                 if (dist > 1.9) { // Outer Decorated Ring
                    finalMx = mx_t * Math.cos(spin1) - my_t * Math.sin(spin1);
                    finalMy = mx_t * Math.sin(spin1) + my_t * Math.cos(spin1);
                 } else if (dist > 1.3 && dist < 1.6) { // Inner Runes
                    finalMx = mx_t * Math.cos(spin2) - my_t * Math.sin(spin2);
                    finalMy = mx_t * Math.sin(spin2) + my_t * Math.cos(spin2);
                 } else if (dist < 1.0) { // Center Core
                    finalMx = mx_t * Math.cos(spin3) - my_t * Math.sin(spin3);
                    finalMy = mx_t * Math.sin(spin3) + my_t * Math.cos(spin3);
                 }
                 // Hexagram (1.6-1.9) doesn't spin or spins very slowly (default 0)
             }

             // Lerp to Magic
             tx = tx + (finalMx - tx) * mT;
             ty = ty + (finalMy - ty) * mT;
             tz = tz + (finalMz - tz) * mT;

             // Damping
             const damping = 0.05 + (mT * 0.1); // Stiffer for magic
             curr[ix] += (tx - curr[ix]) * damping;
             curr[ix+1] += (ty - curr[ix+1]) * damping;
             curr[ix+2] += (tz - curr[ix+2]) * damping;

             // Color Morph
             let r = lotusCol[ix]; let g = lotusCol[ix+1]; let b = lotusCol[ix+2];
             
             // To Galaxy
             r = r + (galCol[ix] - r) * gT;
             g = g + (galCol[ix+1] - g) * gT;
             b = b + (galCol[ix+2] - b) * gT;

             // Twinkle Effect for Galaxy Stars
             // Only active when Galaxy Mode is dominant
             if (gT > 0.5 && i % 7 === 0) {
                 // Calculate a unique twinkle phase based on index
                 const speed = 0.003 + (i % 10) * 0.0005; 
                 const phase = i * 0.1;
                 // Sine wave oscillating between 0.3 and 1.3 intensity
                 const intensity = 0.8 + 0.5 * Math.sin(timeNow * speed + phase);
                 
                 r *= intensity;
                 g *= intensity;
                 b *= intensity;
             }

             // To Magic
             r = r + (magCol[ix] - r) * mT;
             g = g + (magCol[ix+1] - g) * mT;
             b = b + (magCol[ix+2] - b) * mT;

             // Magic Pulse/Glow Effect
             // Adds a breathing golden glow when magic mode is active
             if (mT > 0.01) {
                 // Slow breathing pulse
                 const pulse = Math.sin(timeNow * 0.003) * 0.2 + 0.2; 
                 // Fast shimmer for "energy" feel
                 const shimmer = Math.sin(timeNow * 0.01 + ix) * 0.1; 
                 
                 const totalGlow = (pulse + shimmer) * mT;
                 
                 // Boost colors towards bright gold/white
                 r += totalGlow;
                 g += totalGlow * 0.8; // Keep it warm
                 b += totalGlow * 0.2;
             }
             
             // MOUSE HOVER INTERACTION
             // Check distance to mouse cursor in world space
             // We only check 1 in 10 particles to save performance or check all if efficient enough.
             // Checking all is fine for 180k on modern GPU/CPU but JS is single threaded.
             // Optimization: Simple Box check first or accept cost.
             const dx = curr[ix] - mx;
             const dy = curr[ix+1] - my;
             const dz = curr[ix+2] - mz;
             // Distance squared check (avoid sqrt)
             // Radius 0.4 -> 0.16
             const distSq = dx*dx + dy*dy + dz*dz;
             if (distSq < 0.2) {
                 // Brighten color (Hover Highlight)
                 r = Math.min(1.0, r + 0.4);
                 g = Math.min(1.0, g + 0.4);
                 b = Math.min(1.0, b + 0.4);
                 
                 // Jitter Position (Excitement)
                 curr[ix] += (Math.random()-0.5) * 0.03;
                 curr[ix+1] += (Math.random()-0.5) * 0.03;
                 curr[ix+2] += (Math.random()-0.5) * 0.03;
             }

             currCol[ix] = r;
             currCol[ix+1] = g;
             currCol[ix+2] = b;
         }

         geometryRef.current.attributes.position.needsUpdate = true;
         geometryRef.current.attributes.color.needsUpdate = true;
      }

      renderer.render(scene, cameraRef.current!);
    };

    animate();

    return () => {
        cancelAnimationFrame(frameIdRef.current);
        renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} onMouseMove={handleMouseMove} onClick={handleClick} className="absolute inset-0 w-full h-full z-10" />;
};

export default ParticleCanvas;