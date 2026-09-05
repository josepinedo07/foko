/**
 * FieldLens AR - Realistic Industrial Equipment Video Simulator
 * Renders an animated high-voltage electrical panel & hydraulic machinery loop
 * for testing without requiring a physical camera in the field.
 */

export class EquipmentSimulator {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.running = false;
    this.angle = 0;
    this.voltage = 398;
    this.current = 18.4;
    this.pressure = 6.2;
    this.temp = 42.5;
    this.sparkCounter = 0;
  }

  start() {
    this.running = true;
    this.animate();
  }

  stop() {
    this.running = false;
  }

  animate() {
    if (!this.running) return;

    this.updateData();
    this.render();

    requestAnimationFrame(() => this.animate());
  }

  updateData() {
    this.angle += 0.04;
    // Micro fluctuations
    this.voltage = 398 + Math.sin(this.angle * 2) * 3 + (Math.random() - 0.5) * 1.5;
    this.current = 18.4 + Math.cos(this.angle * 3) * 0.8 + (Math.random() - 0.5) * 0.3;
    this.pressure = 6.2 + Math.sin(this.angle) * 0.4;
    this.temp = 42.5 + Math.sin(this.angle * 0.5) * 0.8;
  }

  render() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    // 1. Industrial Machinery Texture Background
    ctx.fillStyle = '#111726';
    ctx.fillRect(0, 0, w, h);

    // Subtle brushed metal grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // 2. High Voltage Industrial Panel Box
    ctx.save();
    ctx.fillStyle = '#182234';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(w * 0.08, h * 0.08, w * 0.84, h * 0.84, 12);
    ctx.fill();
    ctx.stroke();

    // Hazard Warning Stripe
    ctx.fillStyle = '#ffd600';
    ctx.fillRect(w * 0.08, h * 0.08, w * 0.84, 16);
    ctx.fillStyle = '#060911';
    for (let i = w * 0.08; i < w * 0.92; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, h * 0.08);
      ctx.lineTo(i + 15, h * 0.08);
      ctx.lineTo(i - 5, h * 0.08 + 16);
      ctx.lineTo(i - 20, h * 0.08 + 16);
      ctx.fill();
    }

    // Panel Title
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `bold ${Math.max(12, w * 0.024)}px "JetBrains Mono", monospace`;
    ctx.fillText('TABLERO CONTROL POTENCIA #02 • 400V 50Hz', w * 0.12, h * 0.16);

    // 3. Components in Panel
    // Disyuntor Principal Q1
    this.drawBreaker(ctx, w * 0.15, h * 0.24, w * 0.22, h * 0.28, 'Q1 63A', true);

    // Contactor KM1
    this.drawContactor(ctx, w * 0.42, h * 0.24, w * 0.22, h * 0.28, 'KM1 AC-3', true);

    // Relé Térmico F1
    this.drawThermalRelay(ctx, w * 0.69, h * 0.24, w * 0.22, h * 0.28, 'F1 TÉRMICO');

    // 4. Rotating Motor / Turbine Unit below
    this.drawRotatingTurbine(ctx, w * 0.32, h * 0.72, w * 0.14);

    // 5. Analog & Digital Gauge Cluster
    this.drawGaugeCluster(ctx, w * 0.56, h * 0.58, w * 0.34, h * 0.3);

    // 6. Realistic Camera Timestamp HUD
    ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`CAM-01 [V-FEED] • ${this.voltage.toFixed(1)}V • ${this.current.toFixed(2)}A • ${this.pressure.toFixed(1)} BAR`, w * 0.12, h * 0.96);

    ctx.restore();
  }

  drawBreaker(ctx, x, y, width, height, label, isOn) {
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();

    // Toggle switch
    ctx.fillStyle = isOn ? '#00e676' : '#ff0055';
    ctx.beginPath();
    ctx.roundRect(x + width * 0.3, y + height * 0.25, width * 0.4, height * 0.45, 4);
    ctx.fill();

    // LED Status
    ctx.fillStyle = isOn ? '#00e676' : '#ff0055';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x + width * 0.5, y + height * 0.15, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + width * 0.5, y + height * 0.88);
  }

  drawContactor(ctx, x, y, width, height, label, isActive) {
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();

    // Coil Core
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + width * 0.2, y + height * 0.2, width * 0.6, height * 0.5);

    // Animated vibration
    const vib = Math.sin(this.angle * 20) * 1.2;
    ctx.fillStyle = '#ffd600';
    ctx.fillRect(x + width * 0.35 + vib, y + height * 0.35, width * 0.3, height * 0.2);

    ctx.fillStyle = '#ffd600';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + width * 0.5, y + height * 0.88);
  }

  drawThermalRelay(ctx, x, y, width, height, label) {
    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();

    // Dial test button
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(x + width * 0.5, y + height * 0.38, width * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Reset button
    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(x + width * 0.5, y + height * 0.65, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff0055';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + width * 0.5, y + height * 0.88);
  }

  drawRotatingTurbine(ctx, cx, cy, radius) {
    ctx.save();
    // Outer casing
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Impeller blades spinning
    ctx.translate(cx, cy);
    ctx.rotate(this.angle * 2.5);
    for (let i = 0; i < 6; i++) {
      ctx.rotate((Math.PI * 2) / 6);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.beginPath();
      ctx.ellipse(radius * 0.45, 0, radius * 0.4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center hub
    ctx.fillStyle = '#ffd600';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TURBINA 2850 RPM', cx, cy + radius + 16);
  }

  drawGaugeCluster(ctx, x, y, width, height) {
    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TELEMETRÍA EN VIVO:', x + 12, y + 20);

    // Digital readouts
    const items = [
      { k: 'TENSIÓN L1-L2:', v: `${this.voltage.toFixed(1)} V`, c: '#00e676' },
      { k: 'CORRIENTE:', v: `${this.current.toFixed(2)} A`, c: '#ffd600' },
      { k: 'PRESIÓN ACEITE:', v: `${this.pressure.toFixed(2)} bar`, c: '#00f0ff' },
      { k: 'TEMP. BOBINAS:', v: `${this.temp.toFixed(1)} °C`, c: '#ff0055' }
    ];

    items.forEach((item, idx) => {
      const iy = y + 42 + idx * 22;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(item.k, x + 12, iy);

      ctx.fillStyle = item.c;
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.fillText(item.v, x + width - 75, iy);
    });
  }
}
