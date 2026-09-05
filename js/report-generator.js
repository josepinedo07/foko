/**
 * FieldLens AR - Service Inspection Report Generator & Evidence Collector
 * Captures annotated snapshots, tracks diagnostics, and generates printable/PDF work orders.
 */

export class ReportGenerator {
  constructor() {
    this.evidences = [];
    this.reportData = {
      orderId: 'OT-' + Math.floor(100000 + Math.random() * 900000),
      timestamp: new Date().toISOString(),
      clientName: 'Industrias Globales S.A.',
      facility: 'Planta Norte - Sala de Máquinas',
      equipment: 'Tablero Principal de Fuerza & Bomba Centrífuga #02',
      techName: 'Carlos M. (Técnico de Campo)',
      expertName: 'Ing. Elena R. (Especialista Remoto)',
      diagnosis: 'Disparo de relé térmico por sobrecalentamiento en bornas del contactor KM1 y vibración anormal en rodamiento.',
      actionTaken: 'Inspección visual asistida por AR. Se verificaron conexiones de fuerza, apriete de bornes y despiece mecánico.',
      status: 'Resuelto - En Operación',
      notes: 'Se recomienda cambio preventivo del rodamiento 6308 en la próxima parada programada de mantenimiento.'
    };
  }

  addEvidence(dataUrl, notes = '') {
    const evidence = {
      id: 'ev_' + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      dataUrl,
      notes: notes || `Captura anotada #${this.evidences.length + 1}`
    };
    this.evidences.push(evidence);
    return evidence;
  }

  removeEvidence(id) {
    this.evidences = this.evidences.filter(e => e.id !== id);
  }

  getEvidences() {
    return this.evidences;
  }

  updateData(newData) {
    this.reportData = { ...this.reportData, ...newData };
  }

  generateHTML() {
    const d = this.reportData;
    const formattedDate = new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const evidencesHTML = this.evidences.map((ev, index) => `
      <div class="report-evidence-card">
        <div class="evidence-img-wrap">
          <img src="${ev.dataUrl}" alt="Evidencia ${index + 1}" />
        </div>
        <div class="evidence-meta">
          <span class="evidence-num">EVIDENCIA #${index + 1}</span>
          <span class="evidence-time">${ev.timestamp}</span>
          <p class="evidence-notes">${ev.notes}</p>
        </div>
      </div>
    `).join('');

    return `
      <div class="service-report-document" id="printableReport">
        <!-- Header -->
        <header class="report-header">
          <div class="report-brand">
            <div class="report-logo-badge">FIELDLENS AR</div>
            <div class="report-sub">SISTEMA DE ASISTENCIA TÉCNICA REMOTA AUMENTADA</div>
          </div>
          <div class="report-order-meta">
            <div class="order-badge">${d.orderId}</div>
            <div class="order-date">${formattedDate}</div>
          </div>
        </header>

        <hr class="report-divider"/>

        <!-- Metadata Grid -->
        <div class="report-grid">
          <div class="report-field">
            <label>CLIENTE / EMPRESA:</label>
            <div class="val">${d.clientName}</div>
          </div>
          <div class="report-field">
            <label>UBICACIÓN / PLANTA:</label>
            <div class="val">${d.facility}</div>
          </div>
          <div class="report-field">
            <label>EQUIPO INTERVENIDO:</label>
            <div class="val highlight">${d.equipment}</div>
          </div>
          <div class="report-field">
            <label>ESTADO FINAL:</label>
            <div class="val status-badge">${d.status}</div>
          </div>
          <div class="report-field">
            <label>TÉCNICO EN CAMPO:</label>
            <div class="val">${d.techName}</div>
          </div>
          <div class="report-field">
            <label>ESPECIALISTA REMOTO:</label>
            <div class="val">${d.expertName}</div>
          </div>
        </div>

        <!-- Diagnostic Sections -->
        <div class="report-section">
          <h3>DIAGNÓSTICO TÉCNICO:</h3>
          <p>${d.diagnosis}</p>
        </div>

        <div class="report-section">
          <h3>ACCIONES REALIZADAS CON ASISTENCIA VISUAL:</h3>
          <p>${d.actionTaken}</p>
        </div>

        <!-- Evidences Section -->
        <div class="report-section">
          <h3>EVIDENCIAS FOTOGRÁFICAS CON REALIDAD AUMENTADA (${this.evidences.length}):</h3>
          ${this.evidences.length > 0 
            ? `<div class="report-evidences-grid">${evidencesHTML}</div>` 
            : `<div class="no-evidences">No se tomaron capturas durante esta llamada. Haz clic en "Capturar Evidencia" para adjuntar fotos marcadas.</div>`
          }
        </div>

        <!-- Recommendations & Signatures -->
        <div class="report-section">
          <h3>RECOMENDACIONES & OBSERVACIONES:</h3>
          <p>${d.notes}</p>
        </div>

        <div class="report-signatures">
          <div class="sign-box">
            <div class="sign-line"></div>
            <div>Firma Técnico en Campo</div>
            <small>${d.techName}</small>
          </div>
          <div class="sign-box">
            <div class="sign-line"></div>
            <div>Firma Especialista Remoto</div>
            <small>${d.expertName}</small>
          </div>
        </div>

        <footer class="report-footer">
          Generado automáticamente por FieldLens AR • Plataforma de Tele-Mantenimiento Inteligente
        </footer>
      </div>
    `;
  }
}
