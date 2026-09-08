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

import { ICE_SERVERS } from './rtc-config.js';

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
  }

  // ---- Ciclo de vida --------------------------------------------------------

  async initPeer() {
    if (typeof Peer === 'undefined') {
      this.onStatus({ state: 'error', message: 'No se pudo cargar PeerJS (¿sin internet?).' });
      return;
    }

    // El experto reclama el código de sala como su ID. El campo usa un ID random.
    const peerId = this.role === 'expert' ? this.roomCode : undefined;

    this.peer = new Peer(peerId, {
      debug: 1,
      config: { iceServers: ICE_SERVERS },
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

  async startCamera() {
    if (this.localStream) this.localStream.getTracks().forEach((t) => t.stop());
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: this.facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const audio = this.localStream.getAudioTracks()[0];
    if (audio) audio.enabled = this._micEnabled;
    this._replaceOutgoingTracks();
    return this.localStream;
  }

  async switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    return this.startCamera();
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

  async toggleTorch() {
    const track = this.localStream && this.localStream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return false;
    if (!track.getCapabilities().torch) return false;
    this.torchOn = !this.torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: this.torchOn }] });
      return this.torchOn;
    } catch (_) {
      return false;
    }
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
    [this.localStream, this.screenStream].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
    if (this.peer) this.peer.destroy();
  }
}
