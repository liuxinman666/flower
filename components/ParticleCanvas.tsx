import React, { useEffect, useRef, useCallback } from 'react';

interface ParticleCanvasProps {
  imageSrc: string | null;
}

// Cool/Holographic palette for fallback
const PALETTE = [
  '#A0C4FF', // Light Blue
  '#BDB2FF', // Light Purple
  '#9BF6FF', // Cyan
  '#FDFFB6', // Pale Yellow (Highlights)
  '#FFFFFF', // White
  '#CAFFBF', // Pale Green (rare accents)
];

class Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  baseSize: number; // Store the original size
  size: number;
  color: string;
  vx: number;
  vy: number;
  ease: number;
  friction: number;
  dx: number;
  dy: number;
  distance: number;
  force: number;
  angle: number;
  
  // Wave properties
  waveAngle: number;
  waveSpeed: number;
  waveAmplitude: number;
  
  // Breathing/Pulse properties
  pulsePhase: number;
  pulseSpeed: number;

  // Drift properties (Ambient Movement)
  driftPhase: number;
  driftSpeed: number;
  driftRadius: number;

  // Trail properties
  history: { x: number; y: number }[];

  constructor(x: number, y: number, color: string, canvasWidth: number, canvasHeight: number) {
    this.originX = x;
    this.originY = y;
    
    // Start scattered
    this.x = Math.random() * canvasWidth;
    this.y = Math.random() * canvasHeight;
    
    // FINER SIZE for higher density (gap=2)
    // Range: 0.5px to 1.5px
    this.baseSize = Math.random() * 1.0 + 0.5; 
    this.size = this.baseSize;
    this.color = color;
    
    this.vx = 0;
    this.vy = 0;
    
    this.ease = 0.005; 
    this.friction = 0.92; 
    
    this.dx = 0;
    this.dy = 0;
    this.distance = 0;
    this.force = 0;
    this.angle = 0;

    this.waveAngle = Math.random() * Math.PI * 2;
    this.waveSpeed = 0.0005 + Math.random() * 0.0015; 
    this.waveAmplitude = 1 + Math.random() * 3; 

    // Initialize individual pulse for "breathing" effect
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.pulseSpeed = 0.02 + Math.random() * 0.03;

    // Initialize random ambient drift
    this.driftPhase = Math.random() * Math.PI * 2;
    this.driftSpeed = 0.5 + Math.random() * 1.5; // Controls the speed of the drift cycle
    this.driftRadius = 3 + Math.random() * 12; // Controls how far it drifts (pixels)

    this.history = [];
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Draw trail
    for (let i = 0; i < this.history.length; i++) {
      const point = this.history[i];
      const ratio = (i + 1) / this.history.length; 
      // Trail scales with current size
      const trailSize = this.size * ratio * 0.6; 

      if (trailSize < 0.2) continue;

      ctx.beginPath();
      ctx.fillStyle = this.color;
      ctx.globalAlpha = 0.3 * ratio;
      ctx.arc(point.x, point.y, trailSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1.0;

    // Draw Head
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }

  update(mouse: { x: number; y: number; radius: number }, time: number, canvasWidth: number, canvasHeight: number) {
    // 1. INDIVIDUAL BREATHING (Pulse)
    // Oscillate size between 70% and 130% of baseSize
    const pulse = Math.sin(time * 2 + this.pulsePhase);
    this.size = this.baseSize * (1 + pulse * 0.3);

    // Update History
    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > 3) { 
      this.history.shift();
    }

    // 2. FLOWER FOLDING/UNFOLDING EFFECT
    // We want the flower to slowly close (fold) and open (unfold).
    // Use a slow sine wave for the cycle.
    // Scale ranges from 0.85 (folded/closed) to 1.05 (open/bloomed).
    const bloomCycle = Math.sin(time * 2.0); // Adjust frequency for the slow motion time
    const bloomScale = 0.85 + (bloomCycle * 0.20); 

    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    const relativeX = this.originX - centerX;
    const relativeY = this.originY - centerY;
    
    // Add a slight rotation spiral effect when closing to simulate folding petals
    // When scale is small (closed), rotate more.
    const rotationStrength = (1.0 - bloomScale) * 0.5; 
    const currentDist = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
    const currentAngle = Math.atan2(relativeY, relativeX);
    
    // Particles further out rotate slightly more
    const newAngle = currentAngle + rotationStrength * (currentDist / 300);

    const rotatedX = Math.cos(newAngle) * currentDist;
    const rotatedY = Math.sin(newAngle) * currentDist;
    
    const targetX = centerX + (rotatedX * bloomScale);
    const targetY = centerY + (rotatedY * bloomScale);

    // Mouse Interaction
    this.dx = mouse.x - this.x;
    this.dy = mouse.y - this.y;
    this.distance = Math.sqrt(this.dx * this.dx + this.dy * this.dy);

    if (this.distance < mouse.radius) {
      this.force = -mouse.radius / this.distance;
      this.angle = Math.atan2(this.dy, this.dx);
      this.vx += this.force * Math.cos(this.angle) * 2; 
      this.vy += this.force * Math.sin(this.angle) * 2;
    }

    // 3. SLOW WAVE FLUCTUATION (Coordinated)
    const waveX = Math.sin(time * 0.5 + this.originY * 0.05) * this.waveAmplitude;
    const waveY = Math.cos(time * 0.3 + this.originX * 0.05) * this.waveAmplitude;

    // 4. RANDOM AMBIENT DRIFT (Individual)
    // Adds a unique, floating sensation to each particle
    const driftX = Math.sin(time * this.driftSpeed + this.driftPhase) * this.driftRadius;
    const driftY = Math.cos(time * this.driftSpeed * 0.8 + this.driftPhase) * this.driftRadius;

    // Physics update
    // We pull the particle towards: Target (Bloom) + Global Wave + Local Drift
    const desiredX = targetX + waveX + driftX;
    const desiredY = targetY + waveY + driftY;

    this.vx += (desiredX - this.x) * this.ease;
    this.vy += (desiredY - this.y) * this.ease;

    this.vx *= this.friction;
    this.vy *= this.friction;

    this.x += this.vx;
    this.y += this.vy;
  }
}

const ParticleCanvas: React.FC<ParticleCanvasProps> = ({ imageSrc }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  // Adjusted radius to 100 (within 80-150 range)
  const mouseRef = useRef({ x: 0, y: 0, radius: 100 });
  const timeRef = useRef(0);

  const desaturateColor = (r: number, g: number, b: number, factor: number = 0.6): string => {
    // Increased default desaturation factor to 0.6 for more "pastel/faded" look
    const avg = (r + g + b) / 3;
    const newR = Math.floor(r * (1 - factor) + avg * factor);
    const newG = Math.floor(g * (1 - factor) + avg * factor);
    const newB = Math.floor(b * (1 - factor) + avg * factor);
    return `rgb(${newR}, ${newG}, ${newB})`;
  };

  const initParticles = useCallback((img: HTMLImageElement, ctx: CanvasRenderingContext2D, width: number, height: number) => {
    particlesRef.current = [];
    
    const scale = Math.min(width / img.width, height / img.height) * 0.75; 
    const newWidth = img.width * scale;
    const newHeight = img.height * scale;
    const offsetX = (width - newWidth) / 2;
    const offsetY = (height - newHeight) / 2;

    ctx.drawImage(img, offsetX, offsetY, newWidth, newHeight);
    
    // GAP REDUCED from 3 to 2 for HIGH DENSITY
    // This creates extremely rich detail
    const gap = 2; 
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y += gap) {
      for (let x = 0; x < width; x += gap) {
        const index = (y * width + x) * 4;
        
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const alpha = data[index + 3];

        const brightness = (r + g + b) / 3;

        if (alpha > 128 && brightness > 25) {
          
          let color;
          
          if (brightness > 230) {
             color = '#FFFFFF'; 
          } else {
             // Apply desaturation here
             color = desaturateColor(r, g, b, 0.6);
          }

          particlesRef.current.push(new Particle(x, y, color, width, height));
        }
      }
    }
    
    ctx.clearRect(0, 0, width, height);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      if (imageSrc) {
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => initParticles(img, ctx, canvas.width, canvas.height);
      }
    });
    resizeObserver.observe(document.body);

    if (imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initParticles(img, ctx, canvas.width, canvas.height);
      };
    } else {
      particlesRef.current = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // SLOW MOTION: Reduced time increment from 0.005 to 0.0005 (10x slower)
      timeRef.current += 0.0005;

      particlesRef.current.forEach(particle => {
        particle.update(mouseRef.current, timeRef.current, canvas.width, canvas.height);
        particle.draw(ctx);
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [imageSrc, initParticles]);

  const handleMouseMove = (e: React.MouseEvent) => {
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
        mouseRef.current.x = e.touches[0].clientX;
        mouseRef.current.y = e.touches[0].clientY;
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
    />
  );
};

export default ParticleCanvas;