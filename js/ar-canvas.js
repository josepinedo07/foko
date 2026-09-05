/**
 * FieldLens AR - AR Canvas Engine
 * Coordinates normalization, synchronized drawing, laser pointer, and step pins.
 */

export class ARCanvas {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.isInteractive = options.isInteractive || false;
    this.onEmitAction = options.onEmitAction || (() => {});
    
    // State
    this.currentTool = 'laser'; // 'laser', 'pen', 'arrow', 'circle', 'step_pin'
    this.currentColor = '#00f0ff'; // #00f0ff, #ffd600, #ff0055, #00e676
    this.brushSize = 4;
    this.stepCounter = 1;
    
    // Active laser pointer
    this.laser = {
      active: false,
      normX: 0.5,
      normY: 0.5,
      lastUpdate: 0,
      opacity: 0,
      pings: [] // radar shockwaves
    };

    // Stored persistent annotations
    this.strokes = []; // array of { type: 'pen'|'arrow'|'circle', points, color, width }
    this.pins = [];    // array of { id, number, normX, normY, label, color, createdAt }
    this.isDrawing = false;
    this.currentStroke = null;

    // Freeze frame state
    this.frozenImage = null;

    this.resizeObserver = null;
    this.init();
  }

  init() {
    this.handleResize = this.handleResize.bind(this);
    this.renderLoop = this.renderLoop.bind(this);

    window.addEventListener('resize', this.handleResize);
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvas.parentElement || this.canvas);

    this.handleResize();

    if (this.isInteractive) {
      this.attachEventListeners();
    }

    requestAnimationFrame(this.renderLoop);
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
  }

  attachEventListeners() {
    const el = this.canvas;

    // Mouse & Touch Unified Handling
    const getNormCoords = (e) => {
      const rect = el.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return { normX, normY };
    };

    const handlePointerDown = (e) => {
      e.preventDefault();
      const { normX, normY } = getNormCoords(e);
      this.isDrawing = true;

      if (this.currentTool === 'laser') {
        this.setLaser(normX, normY, true);
        this.addLaserPing(normX, normY, this.currentColor);
        this.onEmitAction({
          type: 'laser',
          normX,
          normY,
          active: true,
          ping: true,
          color: this.currentColor
        });
      } else if (this.currentTool === 'step_pin') {
        const pin = {
          id: 'pin_' + Date.now(),
          number: this.stepCounter++,
          normX,
          normY,
          label: `Paso ${this.stepCounter - 1}`,
          color: this.currentColor,
          createdAt: Date.now()
        };
        this.pins.push(pin);
        this.onEmitAction({ type: 'add_pin', pin });
        this.addLaserPing(normX, normY, this.currentColor);
      } else if (this.currentTool === 'pen') {
        this.currentStroke = {
          type: 'pen',
          points: [{ normX, normY }],
          color: this.currentColor,
          width: this.brushSize
        };
        this.onEmitAction({
          type: 'stroke_start',
          stroke: this.currentStroke
        });
      } else if (this.currentTool === 'arrow' || this.currentTool === 'circle') {
        this.currentStroke = {
          type: this.currentTool,
          start: { normX, normY },
          end: { normX, normY },
          color: this.currentColor,
          width: this.brushSize
        };
      }
    };

    const handlePointerMove = (e) => {
      const { normX, normY } = getNormCoords(e);

      if (this.currentTool === 'laser') {
        this.setLaser(normX, normY, true);
        this.onEmitAction({
          type: 'laser',
          normX,
          normY,
          active: true,
          color: this.currentColor
        });
      } else if (this.isDrawing && this.currentStroke) {
        if (this.currentTool === 'pen') {
          this.currentStroke.points.push({ normX, normY });
          this.onEmitAction({
            type: 'stroke_move',
            point: { normX, normY }
          });
        } else if (this.currentTool === 'arrow' || this.currentTool === 'circle') {
          this.currentStroke.end = { normX, normY };
          this.onEmitAction({
            type: 'shape_move',
            stroke: this.currentStroke
          });
        }
      }
    };

    const handlePointerUp = () => {
      if (!this.isDrawing && this.currentTool !== 'laser') return;
      this.isDrawing = false;

      if (this.currentTool === 'laser') {
        this.laser.active = false;
        this.onEmitAction({
          type: 'laser',
          active: false
        });
      } else if (this.currentStroke) {
        this.strokes.push(this.currentStroke);
        this.onEmitAction({
          type: 'stroke_end',
          stroke: this.currentStroke
        });
        this.currentStroke = null;
      }
    };

    el.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    el.addEventListener('touchstart', handlePointerDown, { passive: false });
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  }

  // Receive remote actions
  handleRemoteAction(action) {
    if (!action) return;

    switch (action.type) {
      case 'laser':
        if (action.active) {
          this.setLaser(action.normX, action.normY, true, action.color);
          if (action.ping) {
            this.addLaserPing(action.normX, action.normY, action.color || '#00f0ff');
          }
        } else {
          this.laser.active = false;
        }
        break;

      case 'add_pin':
        this.pins.push(action.pin);
        this.addLaserPing(action.pin.normX, action.pin.normY, action.pin.color);
        break;

      case 'stroke_start':
        this.remoteCurrentStroke = action.stroke;
        break;

      case 'stroke_move':
        if (this.remoteCurrentStroke && this.remoteCurrentStroke.points) {
          this.remoteCurrentStroke.points.push(action.point);
        }
        break;

      case 'shape_move':
        this.remoteCurrentStroke = action.stroke;
        break;

      case 'stroke_end':
        if (action.stroke) {
          this.strokes.push(action.stroke);
        }
        this.remoteCurrentStroke = null;
        break;

      case 'clear':
        this.clear(false);
        break;

      case 'undo':
        this.undo(false);
        break;
        
      case 'freeze':
        if (action.dataUrl) {
          this.setFrozenFrame(action.dataUrl);
        } else {
          this.unfreezeFrame();
        }
        break;
    }
  }

  setLaser(normX, normY, active = true, color = null) {
    this.laser.normX = normX;
    this.laser.normY = normY;
    this.laser.active = active;
    this.laser.lastUpdate = Date.now();
    this.laser.opacity = 1;
    if (color) this.laser.color = color;
  }

  addLaserPing(normX, normY, color = '#00f0ff') {
    this.laser.pings.push({
      normX,
      normY,
      radius: 8,
      maxRadius: 65,
      alpha: 1,
      color: color || '#00f0ff',
      startTime: Date.now()
    });
  }

  setFrozenFrame(dataUrl) {
    const img = new Image();
    img.onload = () => {
      this.frozenImage = img;
    };
    img.src = dataUrl;
  }

  unfreezeFrame() {
    this.frozenImage = null;
  }

  clear(emit = true) {
    this.strokes = [];
    this.pins = [];
    this.currentStroke = null;
    this.remoteCurrentStroke = null;
    this.stepCounter = 1;
    if (emit) {
      this.onEmitAction({ type: 'clear' });
    }
  }

  undo(emit = true) {
    if (this.pins.length > 0 && (this.strokes.length === 0 || this.pins[this.pins.length - 1].createdAt > (this.strokes[this.strokes.length - 1].createdAt || 0))) {
      this.pins.pop();
      this.stepCounter = Math.max(1, this.pins.length + 1);
    } else if (this.strokes.length > 0) {
      this.strokes.pop();
    }
    if (emit) {
      this.onEmitAction({ type: 'undo' });
    }
  }

  // 60 FPS Render Loop
  renderLoop() {
    const width = this.displayWidth || this.canvas.width;
    const height = this.displayHeight || this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Frozen frame if active
    if (this.frozenImage) {
      ctx.drawImage(this.frozenImage, 0, 0, width, height);
      // Subtle freeze banner vignette
      ctx.fillStyle = 'rgba(0, 240, 255, 0.06)';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Draw Committed Strokes
    this.strokes.forEach(stroke => this.drawStroke(ctx, stroke, width, height));

    // 3. Draw in-progress strokes
    if (this.currentStroke) {
      this.drawStroke(ctx, this.currentStroke, width, height);
    }
    if (this.remoteCurrentStroke) {
      this.drawStroke(ctx, this.remoteCurrentStroke, width, height);
    }

    // 4. Draw Step Pins
    this.pins.forEach(pin => this.drawPin(ctx, pin, width, height));

    // 5. Draw Radar Shockwave Pings
    const now = Date.now();
    for (let i = this.laser.pings.length - 1; i >= 0; i--) {
      const ping = this.laser.pings[i];
      const progress = (now - ping.startTime) / 800; // 800ms duration

      if (progress >= 1) {
        this.laser.pings.splice(i, 1);
        continue;
      }

      const currentRadius = ping.radius + (ping.maxRadius - ping.radius) * progress;
      const alpha = Math.max(0, 1 - progress);
      const px = ping.normX * width;
      const py = ping.normY * height;

      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, currentRadius, 0, Math.PI * 2);
      ctx.strokeStyle = ping.color;
      ctx.lineWidth = 2.5 * (1 - progress * 0.5);
      ctx.globalAlpha = alpha * 0.9;
      ctx.shadowColor = ping.color;
      ctx.shadowBlur = 14;
      ctx.stroke();

      // Inner sonar ripple
      ctx.beginPath();
      ctx.arc(px, py, currentRadius * 0.6, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = alpha * 0.5;
      ctx.stroke();
      ctx.restore();
    }

    // 6. Draw Animated Laser Pointer
    if (this.laser.active || this.laser.opacity > 0.05) {
      if (!this.laser.active) {
        this.laser.opacity -= 0.04;
      }
      this.drawLaser(ctx, this.laser, width, height);
    }

    requestAnimationFrame(this.renderLoop);
  }

  drawStroke(ctx, stroke, width, height) {
    if (!stroke) return;
    ctx.save();
    ctx.strokeStyle = stroke.color || '#00f0ff';
    ctx.lineWidth = stroke.width || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = stroke.color || '#00f0ff';
    ctx.shadowBlur = 10;

    if (stroke.type === 'pen' && stroke.points && stroke.points.length > 0) {
      ctx.beginPath();
      const first = stroke.points[0];
      ctx.moveTo(first.normX * width, first.normY * height);

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        ctx.lineTo(pt.normX * width, pt.normY * height);
      }
      ctx.stroke();
    } else if (stroke.type === 'arrow' && stroke.start && stroke.end) {
      const x1 = stroke.start.normX * width;
      const y1 = stroke.start.normY * height;
      const x2 = stroke.end.normX * width;
      const y2 = stroke.end.normY * height;

      // Line
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 18;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = stroke.color;
      ctx.fill();
    } else if (stroke.type === 'circle' && stroke.start && stroke.end) {
      const x1 = stroke.start.normX * width;
      const y1 = stroke.start.normY * height;
      const x2 = stroke.end.normX * width;
      const y2 = stroke.end.normY * height;
      const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

      ctx.beginPath();
      ctx.arc(x1, y1, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPin(ctx, pin, width, height) {
    const x = pin.normX * width;
    const y = pin.normY * height;
    const color = pin.color || '#ffd600';

    ctx.save();
    // Glowing Pin Head
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();

    // Dark Inner Border
    ctx.strokeStyle = '#060911';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Step Number Text
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#060911';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pin.number, x, y);

    // Pointer tail pointing downwards
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 15);
    ctx.lineTo(x + 5, y + 15);
    ctx.lineTo(x, y + 24);
    ctx.closePath();
    ctx.fill();

    // Optional Label Pill
    if (pin.label) {
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      const textWidth = ctx.measureText(pin.label).width;
      const pillWidth = textWidth + 16;
      const pillHeight = 20;
      const pillX = x - pillWidth / 2;
      const pillY = y + 28;

      ctx.fillStyle = 'rgba(11, 17, 30, 0.9)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pin.label, x, pillY + pillHeight / 2);
    }
    ctx.restore();
  }

  drawLaser(ctx, laser, width, height) {
    const x = laser.normX * width;
    const y = laser.normY * height;
    const color = laser.color || '#ff1744';

    ctx.save();
    ctx.globalAlpha = laser.opacity;

    // Glowing Laser Halo
    const gradient = ctx.createRadialGradient(x, y, 2, x, y, 28);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.3, color);
    gradient.addColorStop(0.8, 'rgba(255, 23, 68, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 23, 68, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();

    // Bright Core Center
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Crosshair ticks
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    const tickLen = 7;
    const tickGap = 8;

    // Top
    ctx.beginPath(); ctx.moveTo(x, y - tickGap); ctx.lineTo(x, y - tickGap - tickLen); ctx.stroke();
    // Bottom
    ctx.beginPath(); ctx.moveTo(x, y + tickGap); ctx.lineTo(x, y + tickGap + tickLen); ctx.stroke();
    // Left
    ctx.beginPath(); ctx.moveTo(x - tickGap, y); ctx.lineTo(x - tickGap - tickLen, y); ctx.stroke();
    // Right
    ctx.beginPath(); ctx.moveTo(x + tickGap, y); ctx.lineTo(x + tickGap + tickLen, y); ctx.stroke();

    ctx.restore();
  }

  // Export current annotated frame as DataURL
  captureFrame(videoElement) {
    const offscreen = document.createElement('canvas');
    offscreen.width = this.canvas.width;
    offscreen.height = this.canvas.height;
    const offCtx = offscreen.getContext('2d');

    // Draw video or canvas background
    if (videoElement && (videoElement.videoWidth || (videoElement.width && videoElement.tagName === 'CANVAS') || videoElement.width)) {
      offCtx.drawImage(videoElement, 0, 0, offscreen.width, offscreen.height);
    } else if (this.frozenImage) {
      offCtx.drawImage(this.frozenImage, 0, 0, offscreen.width, offscreen.height);
    } else {
      offCtx.fillStyle = '#0b111e';
      offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    }

    // Draw AR canvas overlay
    offCtx.drawImage(this.canvas, 0, 0);

    return offscreen.toDataURL('image/jpeg', 0.92);
  }
}
