/**
 * FOKO - Asistente de notas: transcripción en vivo de la voz del técnico de
 * oficina (Web Speech API del navegador) + generación del reporte vía /api/report.
 *
 * Nota: la Web Speech API solo transcribe el micrófono local (el técnico
 * remoto). Lo que dice el de campo llega por el audio y solo se capta si el
 * remoto usa altavoz en vez de auriculares.
 */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const TRANSCRIPTION_SUPPORTED = !!SR;

export class NotesAssistant {
  constructor({ lang = 'es-MX', onUpdate = () => {} } = {}) {
    this.lang = lang;
    this.onUpdate = onUpdate;
    this.finalText = '';
    this.interim = '';
    this.active = false;
    this.rec = null;
  }

  startTranscription() {
    if (!SR || this.active) return false;
    this.active = true;
    const rec = new SR();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          this.finalText += (this.finalText ? ' ' : '') + chunk.trim();
        } else {
          interim += chunk;
        }
      }
      this.interim = interim;
      this.onUpdate(this.text);
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false;
        this.onUpdate(this.text, 'Sin permiso de micrófono para transcribir.');
      }
    };

    rec.onend = () => {
      if (this.active) {
        try { rec.start(); } catch (_) { /* reintento en el siguiente ciclo */ }
      }
    };

    this.rec = rec;
    try { rec.start(); } catch (_) {}
    return true;
  }

  stopTranscription() {
    this.active = false;
    if (this.rec) { try { this.rec.stop(); } catch (_) {} this.rec = null; }
    this.interim = '';
  }

  get text() {
    return (this.finalText + (this.interim ? ' ' + this.interim : '')).trim();
  }

  clear() {
    this.finalText = '';
    this.interim = '';
    this.onUpdate('');
  }

  async generateReport({ endpoint, accessCode, notes, meta }) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessCode}`,
      },
      body: JSON.stringify({ transcript: this.finalText, notes, meta }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data.report || '';
  }
}
