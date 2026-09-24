/**
 * FOKO - Gestor de conexión WebRTC (PeerJS)
 *
 * Roles:
 *   - 'expert' : técnico remoto. Su Peer ID ES el código de sala. Espera a que
 *                el técnico de campo se conecte. Recibe cámara+mic del campo,
 *                responde con su micrófono, y puede llamar de vuelta con la
 *                pantalla compartida.
 *   - 'field'  : técnico de campo. Se conecta al código de sala, envía su
 *                cámara+mic y recibe el audio del experto y su pantalla.
 *
 * Señalización: broker público de PeerJS (sin servidor propio).
 * Recorrido NAT: STUN + TURN opcional (js/rtc-config.js).
 */

import { getIceServers } from './rtc-config.js';

// Escalones de captura: se baja al siguiente solo si ensureCleanCapture() detecta
// cuadros corruptos. null = sin pedir tamaño (lo que el teléfono prefiera).
const CAPTURE_LADDER = [{ w: 1280, h: 720 }, { w: 640, h: 480 }, null];
const RUNG_KEY = 'foko:camRung';
const REAR_KEY = 'foko:rearCam';

const hasTorch = (track) => !!(track && track.getCapabilities && track.getCapabilities().torch);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let probe = null;
// Firma de la corrupción: columnas casi completas de verde puro saturado.
function looksCorrupted(videoEl) {
  const W = 48;
  const H = Math.max(8, Math.round(W * (videoEl.videoHeight / videoEl.videoWidth || 1)));
  probe = probe || document.createElement('canvas');
  probe.width = W; probe.height = H;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  try { ctx.drawImage(videoEl, 0, 0, W, H); } catch (_) { return false; }
  const px = ctx.getImageData(0, 0, W, H).data;
  let run = 0;
  for (let x = 0; x < W; x++) {
    let green = 0;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (g > 110 && g > r * 2 && g > b * 2) green++;
    }
    run = green / H > 0.85 ? run + 1 : 0;
    if (run >= 3) return true;
  }
  return false;
}

export class WebRTCManager {
  constructor(options = {}) {
    this.role = options.role || 'expert';
    this.roomCode = (options.roomCode || '').toUpperCase();

    this.onRemoteStream = options.onRemoteStream || (() => {});
    this.onScreenStream = options.onScreenStream || (() => {});
    this.onScreenStreamEnded = options.onScreenStreamEnded || (() => {});
    this.onScreenShareStopped = options.onScreenShareStopped || (() => {});
    this.onData = options.onData || (() => {});
    this.onStatus = options.onStatus || (() => {});

    this.facingMode = 'environment';
    this.localStream = null;        // campo: cámara+mic / experto: solo mic
    this.screenStream = null;       // experto: pantalla compartida
    this.peer = null;
    this.dataConn = null;
    this.cameraCall = null;         // llamada de la cámara del campo
    this.screenCall = null;         // llamada de la pantalla del experto
    this.remotePeerId = null;
    this.torchOn = false;
    this._micEnabled = true;
    this._rung = 0;
    try {
      localStorage.removeItem('foko_cam_device');
      this._rung = Math.min(CAPTURE_LADDER.length - 1, parseInt(localStorage.getItem(RUNG_KEY), 10) || 0);
    } catch (_) {}
  }

  // ---- Ciclo de vida --------------------------------------------------------

  async initPeer() {
    if (typeof Peer === 'undefined') {
      this.onStatus({ state: 'error', message: 'No se pudo cargar PeerJS (¿sin internet?).' });
      return;
    }

    // El experto reclama el código de sala como su ID. El campo usa un ID random.
    const peerId = this.role === 'expert' ? this.roomCode : undefined;
    const iceServers = await getIceServers();

    this.peer = new Peer(peerId, {
      debug: 1,
      config: { iceServers },
    });

    this.peer.on('open', (id) => {
      this.onStatus({ state: 'waiting', selfId: id });
      if (this.role === 'field') this._connectToExpert();
    });

    this.peer.on('connection', (conn) => {
      // El experto acepta un solo técnico de campo. Si ya hay uno enlazado,
      // rechaza al segundo (evita que un enlace filtrado meta a un tercero).
      if (this.role === 'expert' && this.dataConn && this.dataConn.open && conn.peer !== this.remotePeerId) {
        try { conn.close(); } catch (_) {}
        return;
      }
      this._setupDataConn(conn);
    });

    this.peer.on('call', (call) => {
      const kind = call.metadata && call.metadata.kind;
      if (this.role === 'expert' && kind === 'camera') {
        if (this.cameraCall && this.remotePeerId && call.peer !== this.remotePeerId) {
          try { call.close(); } catch (_) {}
          return;
        }
        // Responder con nuestro micrófono para que el campo nos oiga.
        call.answer(this.localStream || undefined);
        this.cameraCall = call;
        this.remotePeerId = call.peer;
        call.on('stream', (stream) => this.onRemoteStream(stream));
        call.on('close', () => this.onStatus({ state: 'disconnected' }));
      } else if (this.role === 'field' && kind === 'screen') {
        call.answer();
        this.screenCall = call;
        call.on('stream', (stream) => this.onScreenStream(stream));
        call.on('close', () => this.onScreenStreamEnded());
      } else {
        call.answer();
      }
    });

    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        this.onStatus({ state: 'error', message: 'Ese código de sala ya está en uso. Genera otro.' });
      } else if (err.type === 'peer-unavailable') {
        this.onStatus({ state: 'error', message: 'No hay una sesión activa con ese código.' });
      } else {
        this.onStatus({ state: 'error', message: `Error de conexión (${err.type}).` });
      }
    });

    this.peer.on('disconnected', () => {
      // Reintento de señalización (no corta la llamada en curso).
      try { this.peer.reconnect(); } catch (_) {}
    });
  }

  _connectToExpert() {
    const conn = this.peer.connect(this.roomCode, { reliable: true });
    this._setupDataConn(conn);
    if (this.localStream) {
      this.cameraCall = this.peer.call(this.roomCode, this.localStream, { metadata: { kind: 'camera' } });
      this.cameraCall.on('stream', (stream) => this.onRemoteStream(stream));
    }
  }

  _setupDataConn(conn) {
    this.dataConn = conn;
    this.remotePeerId = conn.peer;
    conn.on('open', () => {
      this.onStatus({ state: 'connected' });
      // helloExtra: datos opcionales (p.ej. marca de empresa) que la página
      // asigna antes de conectar; se adjuntan al primer mensaje del canal.
      this.send({ type: 'hello', role: this.role, ...(this.helloExtra || {}) });
    });
    conn.on('data', (data) => this.onData(data));
    conn.on('close', () => this.onStatus({ state: 'disconnected' }));
  }

  send(payload) {
    if (this.dataConn && this.dataConn.open) {
      try { this.dataConn.send(payload); } catch (_) {}
    }
  }

  /** RTCPeerConnection activo (para leer estadísticas reales en el HUD). */
  getPeerConnection() {
    return (
      (this.cameraCall && this.cameraCall.peerConnection) ||
      (this.screenCall && this.screenCall.peerConnection) ||
      (this.dataConn && this.dataConn.peerConnection) ||
      null
    );
  }

  // ---- Cámara del campo ----------------------------------------------------

  _videoConstraints(useSavedRear = true) {
    const size = CAPTURE_LADDER[this._rung];
    const sizeC = size ? { width: { ideal: size.w }, height: { ideal: size.h } } : {};
    let rearId = null;
    try { rearId = useSavedRear && this.facingMode === 'environment' && localStorage.getItem(REAR_KEY); } catch (_) {}
    return rearId
      ? { deviceId: { exact: rearId }, ...sizeC }
      : { facingMode: { ideal: this.facingMode }, ...sizeC };
  }

  async startCamera() {
    if (this.localStream) this.localStream.getTracks().forEach((t) => t.stop());
    const audioC = { echoCancellation: true, noiseSuppression: true };
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: this._videoConstraints(), audio: audioC });
    } catch (e) {
      // La trasera con flash guardada ya no existe (otro teléfono, permisos): sin ella.
      try { localStorage.removeItem(REAR_KEY); } catch (_) {}
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: this._videoConstraints(false), audio: audioC });
    }
    const audio = this.localStream.getAudioTracks()[0];
    if (audio) audio.enabled = this._micEnabled;
    this._replaceOutgoingTracks();
    // Reiniciar la cámara apaga la linterna; si estaba encendida, la vuelve a prender.
    if (this.torchOn) {
      const track = this.localStream.getVideoTracks()[0];
      try {
        if (!hasTorch(track)) throw new Error('sin linterna');
        await track.applyConstraints({ advanced: [{ torch: true }] });
      } catch (_) { this.torchOn = false; }
    }
    return this.localStream;
  }

  async switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    return this.startCamera();
  }

  /**
   * Algunos teléfonos (visto en Samsung con Chrome reciente) entregan cuadros
   * corruptos a ciertas resoluciones: franja verde sólida + rayas verticales.
   * Revisa unos cuadros del video local y, si ve la franja, baja un escalón de
   * resolución y reinicia la cámara, sin que el técnico tenga que hacer nada.
   * El escalón que funcionó queda guardado para ese teléfono.
   */
  async ensureCleanCapture(videoEl, onRestart) {
    const token = (this._checkToken = (this._checkToken || 0) + 1);
    while (true) {
      if (!(await this._waitForFrames(videoEl)) || token !== this._checkToken) return;
      let bad = 0;
      for (let i = 0; i < 3; i++) {
        await sleep(350);
        if (token !== this._checkToken) return;
        if (looksCorrupted(videoEl)) bad++;
      }
      if (bad < 2 || this._rung >= CAPTURE_LADDER.length - 1) return;
      this._rung++;
      try { localStorage.setItem(RUNG_KEY, String(this._rung)); } catch (_) {}
      try {
        videoEl.srcObject = await this.startCamera();
        if (onRestart) onRestart(this._rung);
      } catch (_) { return; }
    }
  }

  async _waitForFrames(videoEl) {
    for (let i = 0; i < 40; i++) {
      if (videoEl.videoWidth > 0 && videoEl.readyState >= 2) { await sleep(600); return true; }
      await sleep(100);
    }
    return false;
  }

  _replaceOutgoingTracks() {
    const call = this.cameraCall;
    if (!call || !call.peerConnection || !this.localStream) return;
    call.peerConnection.getSenders().forEach((sender) => {
      if (!sender.track) return;
      const next = this.localStream.getTracks().find((t) => t.kind === sender.track.kind);
      if (next) sender.replaceTrack(next);
    });
  }

  /** Devuelve true si logró dejar la linterna en el estado pedido. */
  async toggleTorch() {
    const want = !this.torchOn;
    let track = this.localStream && this.localStream.getVideoTracks()[0];
    if (!track) return false;
    if (want && !hasTorch(track) && this.facingMode === 'environment') {
      track = (await this._switchToTorchCamera()) || (this.localStream && this.localStream.getVideoTracks()[0]);
      if (!track) return false;
    }
    if (want && !hasTorch(track)) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: want }] });
    } catch (_) {
      return false;
    }
    this.torchOn = want;
    return true;
  }

  /**
   * En teléfonos con varias cámaras traseras, facingMode puede abrir una sin
   * flash (ultra gran angular, tele). Prueba las otras traseras y se queda con
   * la primera que tenga linterna; la recuerda para las próximas llamadas.
   * Android no deja abrir dos cámaras a la vez, así que el video parpadea.
   */
  async _switchToTorchCamera() {
    let devices = [];
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (_) {}
    const current = this.localStream.getVideoTracks()[0];
    const currentId = current && current.getSettings && current.getSettings().deviceId;
    const rear = devices.filter((d) => d.deviceId && d.deviceId !== currentId && !/front|frontal|user|selfie/i.test(d.label));
    if (!rear.length) return null;

    const size = CAPTURE_LADDER[this._rung];
    const sizeC = size ? { width: { ideal: size.w }, height: { ideal: size.h } } : {};
    if (current) current.stop();
    for (const d of rear) {
      let probe = null;
      try {
        probe = (await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: d.deviceId }, ...sizeC } })).getVideoTracks()[0];
      } catch (_) { continue; }
      if (hasTorch(probe)) {
        try { localStorage.setItem(REAR_KEY, d.deviceId); } catch (_) {}
        this.localStream = new MediaStream([probe, ...this.localStream.getAudioTracks()]);
        this._replaceOutgoingTracks();
        return probe;
      }
      probe.stop();
    }
    await this.startCamera();
    return null;
  }

  setMicEnabled(enabled) {
    this._micEnabled = enabled;
    const track = this.localStream && this.localStream.getAudioTracks()[0];
    if (track) track.enabled = enabled;
  }

  // ---- Micrófono del experto ---------------------------------------------

  async startMic() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    return this.localStream;
  }

  // ---- Pantalla compartida (experto) -----------------------------------

  async startScreenShare() {
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = this.screenStream.getVideoTracks()[0];
    track.onended = () => this.stopScreenShare();

    if (this.remotePeerId) {
      this.screenCall = this.peer.call(this.remotePeerId, this.screenStream, { metadata: { kind: 'screen' } });
    }
    this.send({ type: 'screen', active: true });
    return this.screenStream;
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    if (this.screenCall) { this.screenCall.close(); this.screenCall = null; }
    this.send({ type: 'screen', active: false });
    this.onScreenShareStopped();
  }

  destroy() {
    this._checkToken = (this._checkToken || 0) + 1;
    [this.localStream, this.screenStream].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
    if (this.peer) this.peer.destroy();
  }
}
