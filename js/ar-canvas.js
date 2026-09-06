/**
 * FieldLens - Capa de anotación sincronizada.
 *
 * Las coordenadas viajan normalizadas [0,1] relativas al RECTÁNGULO REAL del
 * video (no al elemento), asumiendo object-fit: contain en ambos lados. Así un
 * punto cae sobre la misma pieza en la pantalla del experto y del técnico.
 *
 * Herramientas: pointer (cursor en vivo), pen, arrow, ellipse. Deshacer / limpiar.
 */

export class ARCanvas {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.interactive = options.interactive || false;
    this.onEmit = options.onEmit || (() => {});
    // Devuelve el aspect ratio (ancho/alto) de la fuente de video, o null.
    this.getAspect = options.getAspect || (() => null);

    this.tool = 'pointer';
    this.color = '#ff3b30';
    this.width = 4;

    this.strokes = [];            // trazos confirmados
    this.live = new Map();        // id -> trazo en progreso (local o remoto)
    this.remoteCursor = null;     // { x, y, color, ts }
    this.pings = [];              // { x, y, color, start }
    this.frozen = null;           // Image congelada

    this._drawingId = null;
    this._dpr = window.devicePixelRatio || 1;

    this._loop = this._loop.bind(this);
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    new ResizeObserver(this._resize).observe(canvas);
    this._resize();
    if (this.interactive) this._bind();
    requestAnimationFrame(this._loop);
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dw = r.width;
    this.dh = r.height;
    this.canvas.width = r.width * this._dpr;
    this.canvas.height = r.height * this._dpr;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  }

  // Rectángulo del contenido de video dentro del canvas (letterbox de contain).
  contentRect() {
    const aspect = this.getAspect();
    if (!aspect || !isFinite(aspect)) return { x: 0, y: 0, w: this.dw, h: this.dh };
    const elAspect = this.dw / this.dh;
    if (elAspect > aspect) {
      const w = this.dh * aspect;
      return { x: (this.dw - w) / 2, y: 0, w, h: this.dh };
    }
    const h = this.dw / aspect;
    return { x: 0, y: (this.dh - h) / 2, w: this.dw, h };
  }

  _toNorm(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const cr = this.contentRect();
    const x = (clientX - r.left - cr.x) / cr.w;
    const y = (clientY - r.top - cr.y) / cr.h;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  _fromNorm(nx, ny) {
    const cr = this.contentRect();
    return { x: cr.x + nx * cr.w, y: cr.y + ny * cr.h };
  }

  // ---- Entrada -----------------------------------------------------------

  _bind() {
    const el = this.canvas;
    const pos = (e) => {
      const t = e.touches ? e.touches[0] : e;
      return this._toNorm(t.clientX, t.clientY);
    };

    const down = (e) => {
      e.preventDefault();
      const { x, y } = pos(e);
      if (this.tool === 'pointer') {
        this._drawingId = 'ptr';
        this._emitCursor(x, y);
        this.addPing(x, y, this.color);
        this.onEmit({ type: 'ping', x, y, color: this.color });
        return;
      }
      this._drawingId = 'l' + Date.now() + Math.random().toString(36).slice(2, 6);
      const stroke = this.tool === 'pen'
        ? { id: this._drawingId, kind: 'pen', points: [{ x, y }], color: this.color, width: this.width }
        : { id: this._drawingId, kind: this.tool, x1: x, y1: y, x2: x, y2: y, color: this.color, width: this.width };
      this.live.set(this._drawingId, stroke);
      this.onEmit({ type: 'live', stroke });
    };

    const hoverMove = (e) => {
      if (this.tool !== 'pointer') return;
      const { x, y } = this._toNorm(e.clientX, e.clientY);
      this._emitCursor(x, y);
    };

    const move = (e) => {
      const { x, y } = pos(e);
      if (this.tool === 'pointer') {
        if (e.type === 'touchmove' && this._drawingId === 'ptr') this._emitCursor(x, y);
        return;
      }
      if (!this._drawingId) return;
      const s = this.live.get(this._drawingId);
      if (!s) return;
      if (s.kind === 'pen') s.points.push({ x, y });
      else { s.x2 = x; s.y2 = y; }
      this.onEmit({ type: 'live', stroke: s });
    };

    const up = (e) => {
      if (!this._drawingId) return;
      if (this._drawingId === 'ptr') {
        this._drawingId = null;
        if (e && e.type === 'touchend') this.onEmit({ type: 'cursor', hidden: true });
        return;
      }
      const s = this.live.get(this._drawingId);
      this.live.delete(this._drawingId);
      this._drawingId = null;
      if (s) {
        this.strokes.push(s);
        this.onEmit({ type: 'commit', stroke: s });
      }
    };

    const leave = () => {
      if (this.tool === 'pointer') {
        this.onEmit({ type: 'cursor', hidden: true });
      }
    };

    el.addEventListener('mousedown', down);
    el.addEventListener('mousemove', hoverMove);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', leave);
    el.addEventListener('touchstart', down, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }

  _emitCursor(x, y) {
    this._cursorThrottle = this._cursorThrottle || 0;
    const now = performance.now();
    if (now - this._cursorThrottle < 16) return;
    this._cursorThrottle = now;
    this.onEmit({ type: 'cursor', x, y, color: this.color });
  }

  // ---- Acciones remotas -----------------------------------------------

  handleRemote(msg) {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case 'cursor':
        this.remoteCursor = msg.hidden ? null : { x: msg.x, y: msg.y, color: msg.color, ts: Date.now() };
        break;
      case 'ping':
        this.addPing(msg.x, msg.y, msg.color);
        break;
      case 'live':
        this.live.set(msg.stroke.id, msg.stroke);
        break;
      case 'commit':
        this.live.delete(msg.stroke.id);
        this.strokes.push(msg.stroke);
        break;
      case 'undo':
        this.strokes.pop();
        break;
      case 'clear':
        this.strokes = [];
        this.live.clear();
        break;
      case 'freeze':
        if (msg.dataUrl) this.setFrozen(msg.dataUrl);
        else this.clearFrozen();
        break;
    }
  }

  undo() { this.strokes.pop(); this.onEmit({ type: 'undo' }); }
  clear() { this.strokes = []; this.live.clear(); this.onEmit({ type: 'clear' }); }

  addPing(x, y, color) { this.pings.push({ x, y, color: color || '#ff3b30', start: performance.now() }); }

  setFrozen(dataUrl) {
    const img = new Image();
    img.onload = () => { this.frozen = img; };
    img.src = dataUrl;
  }
  clearFrozen() { this.frozen = null; }

  // ---- Render ---------------------------------------------------------

  _loop() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.dw, this.dh);

    if (this.frozen) {
      const cr = this.contentRect();
      ctx.drawImage(this.frozen, cr.x, cr.y, cr.w, cr.h);
    }

    this.strokes.forEach((s) => this._drawStroke(s));
    this.live.forEach((s) => this._drawStroke(s));

    // Pings (anillo que se expande, ~700ms)
    const now = performance.now();
    this.pings = this.pings.filter((p) => now - p.start < 700);
    this.pings.forEach((p) => {
      const t = (now - p.start) / 700;
      const { x, y } = this._fromNorm(p.x, p.y);
      ctx.beginPath();
      ctx.arc(x, y, 6 + t * 34, 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Cursor remoto
    if (this.remoteCursor && now - (this._rcAnim || 0) >= 0) {
      const { x, y } = this._fromNorm(this.remoteCursor.x, this.remoteCursor.y);
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = this.remoteCursor.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    requestAnimationFrame(this._loop);
  }

  _drawStroke(s) {
    const ctx = this.ctx;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.kind === 'pen') {
      if (!s.points.length) return;
      ctx.beginPath();
      s.points.forEach((pt, i) => {
        const { x, y } = this._fromNorm(pt.x, pt.y);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      return;
    }

    const a = this._fromNorm(s.x1, s.y1);
    const b = this._fromNorm(s.x2, s.y2);

    if (s.kind === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const h = 16;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - h * Math.cos(ang - Math.PI / 6), b.y - h * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(b.x - h * Math.cos(ang + Math.PI / 6), b.y - h * Math.sin(ang + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /**
   * Compone la fuente de video + las anotaciones en un canvas nuevo y lo
   * devuelve. `source` es un <video> o <canvas>. Usado para fotos y grabación.
   */
  composite(source, targetW, targetH) {
    const c = document.createElement('canvas');
    c.width = targetW || (source.videoWidth || source.width || this.dw);
    c.height = targetH || (source.videoHeight || source.height || this.dh);
    const g = c.getContext('2d');
    if (this.frozen) g.drawImage(this.frozen, 0, 0, c.width, c.height);
    else if (source) g.drawImage(source, 0, 0, c.width, c.height);

    // Reescalar las anotaciones (que están en coords de pantalla) al tamaño destino.
    const cr = this.contentRect();
    const sx = c.width / cr.w;
    const sy = c.height / cr.h;
    g.save();
    g.scale(sx, sy);
    g.translate(-cr.x, -cr.y);
    g.drawImage(this.canvas, 0, 0, this.dw, this.dh);
    g.restore();
    return c;
  }
}
