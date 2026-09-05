/**
 * FieldLens AR - WebRTC & Realtime Channel Manager
 * Handles camera acquisition, torch, WebRTC Peer connection (PeerJS)
 * and BroadcastChannel local fallback for zero-latency split simulator.
 */

export class WebRTCManager {
  constructor(options = {}) {
    this.role = options.role || 'expert'; // 'expert' | 'tech' | 'simulator'
    this.roomId = options.roomId || 'alpha1';
    this.onRemoteStream = options.onRemoteStream || (() => {});
    this.onRemoteScreenStream = options.onRemoteScreenStream || (() => {});
    this.onDataMessage = options.onDataMessage || (() => {});
    this.onConnectionStatus = options.onConnectionStatus || (() => {});
    this.facingMode = 'environment'; // 'environment' (rear) or 'user' (front)

    this.localStream = null;
    this.localScreenStream = null;
    this.peer = null;
    this.dataConnection = null;
    this.mediaConnection = null;
    this.torchActive = false;

    // BroadcastChannel for instant local testing across tabs or in simulator
    this.channel = new BroadcastChannel(`fieldlens_room_${this.roomId}`);
    this.channel.onmessage = (evt) => {
      if (evt.data && evt.data.sender !== this.role) {
        this.onDataMessage(evt.data.payload);
      }
    };
  }

  // Generate or join peer room
  initPeer(peerId = null) {
    if (typeof Peer === 'undefined') {
      console.warn('PeerJS not loaded in window. Operating in local BroadcastChannel mode.');
      this.onConnectionStatus({ status: 'local_mode', details: 'Modo Local / BroadcastChannel activo' });
      return;
    }

    try {
      const generatedId = peerId || `fieldlens_${this.roomId}_${this.role}`;
      this.peer = new Peer(generatedId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log(`[PeerJS] Registrado con ID: ${id}`);
        this.onConnectionStatus({ status: 'connected_peer', id });

        if (this.role === 'expert') {
          // Listen for incoming connection from mobile tech
          this.peer.on('connection', (conn) => {
            this.setupDataConnection(conn);
          });
          this.peer.on('call', (call) => {
            console.log('[PeerJS] Llamada de video entrante del técnico');
            call.answer(); // Expert receives field video
            call.on('stream', (remoteStream) => {
              this.onRemoteStream(remoteStream);
            });
            this.mediaConnection = call;
          });
        } else if (this.role === 'tech') {
          // Connect to expert
          this.connectToExpert();
        }
      });

      this.peer.on('error', (err) => {
        console.warn('[PeerJS] Error o aviso:', err.type, err);
        this.onConnectionStatus({ status: 'peer_warning', error: err.type });
      });
    } catch (e) {
      console.error('[PeerJS] Init error:', e);
    }
  }

  connectToExpert() {
    const expertPeerId = `fieldlens_${this.roomId}_expert`;
    console.log(`[PeerJS] Conectando a experto: ${expertPeerId}`);
    
    // 1. Data Connection
    const conn = this.peer.connect(expertPeerId, { reliable: true });
    this.setupDataConnection(conn);

    // 2. Video Call to Expert if stream is ready
    if (this.localStream) {
      const call = this.peer.call(expertPeerId, this.localStream);
      this.mediaConnection = call;
    }
  }

  setupDataConnection(conn) {
    this.dataConnection = conn;
    conn.on('open', () => {
      console.log('[PeerJS] DataChannel P2P abierto!');
      this.onConnectionStatus({ status: 'p2p_active', details: 'Enlace WebRTC P2P Directo' });
    });
    conn.on('data', (data) => {
      this.onDataMessage(data);
    });
    conn.on('close', () => {
      this.onConnectionStatus({ status: 'disconnected', details: 'Enlace P2P cerrado' });
    });
  }

  // Start field camera
  async startCamera(constraints = {}) {
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }

      const defaultConstraints = {
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      };

      this.localStream = await navigator.mediaDevices.getUserMedia({
        ...defaultConstraints,
        ...constraints
      });

      // If call already active, update stream track
      if (this.mediaConnection && this.mediaConnection.peerConnection) {
        const senders = this.mediaConnection.peerConnection.getSenders();
        const videoTrack = this.localStream.getVideoTracks()[0];
        const sender = senders.find(s => s.track && s.track.kind === 'video');
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      }

      return this.localStream;
    } catch (err) {
      console.error('Error accediendo a cámara física:', err);
      throw err;
    }
  }

  // Toggle front/rear camera
  async switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    return await this.startCamera();
  }

  // Toggle flashlight / torch on mobile rear camera
  async toggleTorch() {
    if (!this.localStream) return false;
    const track = this.localStream.getVideoTracks()[0];
    if (!track) return false;

    try {
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.torch) {
        this.torchActive = !this.torchActive;
        await track.applyConstraints({
          advanced: [{ torch: this.torchActive }]
        });
        return this.torchActive;
      } else {
        console.warn('Este dispositivo o navegador no soporta control de linterna vía web.');
        return false;
      }
    } catch (e) {
      console.error('Error al encender linterna:', e);
      return false;
    }
  }

  // Start Screen Share (Expert -> Field Tech)
  async startScreenShare() {
    try {
      this.localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      this.sendMessage({
        type: 'screen_share_status',
        active: true
      });

      // Track stopped event
      this.localScreenStream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };

      return this.localScreenStream;
    } catch (err) {
      console.warn('Compartir pantalla cancelado o no disponible:', err);
      return null;
    }
  }

  stopScreenShare() {
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach(t => t.stop());
      this.localScreenStream = null;
    }
    this.sendMessage({
      type: 'screen_share_status',
      active: false
    });
  }

  // Broadcast message over both DataChannel and Local BroadcastChannel
  sendMessage(payload) {
    // 1. Send via local BroadcastChannel (handles simulation / multi-tab)
    try {
      this.channel.postMessage({
        sender: this.role,
        payload
      });
    } catch (e) {
      console.warn('Error en BroadcastChannel:', e);
    }

    // 2. Send via WebRTC DataConnection if connected
    if (this.dataConnection && this.dataConnection.open) {
      try {
        this.dataConnection.send(payload);
      } catch (e) {
        console.warn('Error en DataConnection send:', e);
      }
    }
  }

  destroy() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach(t => t.stop());
    }
    if (this.channel) {
      this.channel.close();
    }
    if (this.peer) {
      this.peer.destroy();
    }
  }
}
