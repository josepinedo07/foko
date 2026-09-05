/**
 * FieldLens AR - Schematics & Technical Diagrams Manager
 * Built-in industrial vector schematics, custom blueprint upload, and remote sync.
 */

export const BUILTIN_SCHEMATICS = [
  {
    id: 'elec_panel',
    title: 'Diagrama Eléctrico Unifilar - Tablero de Control',
    category: 'Electricidad Industrial',
    description: 'Circuito de fuerza y mando trifásico con guardamotor, contactor KM1 y parada de emergencia.',
    svg: `
      <svg viewBox="0 0 600 420" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#090d16; border-radius:8px;">
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#152033" stroke-width="0.8"/>
          </pattern>
        </defs>
        <rect width="600" height="420" fill="url(#grid)" />
        
        <!-- Líneas de Alimentación L1 L2 L3 N PE -->
        <g stroke="#94a3b8" stroke-width="2">
          <line x1="60" y1="40" x2="540" y2="40" stroke="#f43f5e" />
          <line x1="60" y1="55" x2="540" y2="55" stroke="#00f0ff" />
          <line x1="60" y1="70" x2="540" y2="70" stroke="#ffd600" />
          <line x1="60" y1="85" x2="540" y2="85" stroke="#3b82f6" stroke-dasharray="4,4" />
          <line x1="60" y1="100" x2="540" y2="100" stroke="#22c55e" stroke-dasharray="8,4" />
        </g>
        <text x="70" y="32" fill="#f43f5e" font-size="11" font-family="monospace">L1 (400V)</text>
        <text x="140" y="32" fill="#00f0ff" font-size="11" font-family="monospace">L2</text>
        <text x="180" y="32" fill="#ffd600" font-size="11" font-family="monospace">L3</text>
        <text x="220" y="32" fill="#3b82f6" font-size="11" font-family="monospace">N</text>
        <text x="260" y="32" fill="#22c55e" font-size="11" font-family="monospace">PE (Tierra)</text>

        <!-- Interruptor General Q1 -->
        <rect x="180" y="130" width="80" height="45" rx="4" fill="#111a2e" stroke="#00f0ff" stroke-width="2"/>
        <text x="220" y="152" fill="#00f0ff" font-size="12" font-weight="bold" text-anchor="middle" font-family="monospace">Q1 - 63A</text>
        <text x="220" y="167" fill="#94a3b8" font-size="9" text-anchor="middle">Disyuntor Princ.</text>

        <!-- Contactor KM1 -->
        <rect x="180" y="210" width="80" height="45" rx="4" fill="#111a2e" stroke="#ffd600" stroke-width="2"/>
        <text x="220" y="232" fill="#ffd600" font-size="12" font-weight="bold" text-anchor="middle" font-family="monospace">KM1 (AC-3)</text>
        <text x="220" y="247" fill="#94a3b8" font-size="9" text-anchor="middle">Contactor Motor</text>

        <!-- Relé Térmico F1 -->
        <rect x="180" y="290" width="80" height="45" rx="4" fill="#111a2e" stroke="#ff0055" stroke-width="2"/>
        <text x="220" y="312" fill="#ff0055" font-size="12" font-weight="bold" text-anchor="middle" font-family="monospace">F1 - 18-25A</text>
        <text x="220" y="327" fill="#94a3b8" font-size="9" text-anchor="middle">Relé Térmico</text>

        <!-- Conexión vertical de fuerza -->
        <path d="M 220 70 L 220 130 M 220 175 L 220 210 M 220 255 L 220 290 M 220 335 L 220 365" stroke="#00f0ff" stroke-width="3" fill="none"/>

        <!-- Motor M1 -->
        <circle cx="220" cy="385" r="22" fill="#0f172a" stroke="#22c55e" stroke-width="3"/>
        <text x="220" y="389" fill="#22c55e" font-size="13" font-weight="bold" text-anchor="middle" font-family="monospace">M1 3~</text>
        <text x="270" y="390" fill="#94a3b8" font-size="10">11 kW / 15 HP</text>

        <!-- Circuito de Mando Auxiliar -->
        <g transform="translate(340, 120)">
          <rect x="0" y="0" width="200" height="240" rx="6" fill="#0c1322" stroke="rgba(255,255,255,0.15)" stroke-dasharray="4,4"/>
          <text x="100" y="22" fill="#f8fafc" font-size="11" font-weight="bold" text-anchor="middle">MANDO 24V DC</text>

          <!-- Parada Emergencia S0 -->
          <circle cx="100" cy="55" r="14" fill="#ff0055" stroke="#fff" stroke-width="2"/>
          <text x="100" y="59" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">S0 [NC]</text>
          <text x="100" y="80" fill="#ff0055" font-size="9" text-anchor="middle">Parada Emergencia</text>

          <!-- Pulsador Marcha S1 -->
          <circle cx="100" cy="115" r="14" fill="#22c55e" stroke="#fff" stroke-width="2"/>
          <text x="100" y="119" fill="#fff" font-size="9" font-weight="bold" text-anchor="middle">S1 [NO]</text>
          <text x="100" y="140" fill="#22c55e" font-size="9" text-anchor="middle">Marcha (Start)</text>

          <!-- Bobina KM1 A1/A2 -->
          <rect x="60" y="170" width="80" height="35" rx="4" fill="#1e293b" stroke="#ffd600" stroke-width="1.5"/>
          <text x="100" y="192" fill="#ffd600" font-size="11" font-family="monospace" text-anchor="middle">KM1: A1 - A2</text>
        </g>
      </svg>
    `
  },
  {
    id: 'hvac_circuit',
    title: 'Circuito Frigorífico HVAC & Bomba de Calor',
    category: 'Climatización & HVAC',
    description: 'Ciclo de compresión de refrigerante R410A/R32 con presostatos de alta/baja y válvula inversora.',
    svg: `
      <svg viewBox="0 0 600 420" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#090d16; border-radius:8px;">
        <defs>
          <linearGradient id="hotGas" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ff0055"/>
            <stop offset="100%" stop-color="#f59e0b"/>
          </linearGradient>
          <linearGradient id="coldGas" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#3b82f6"/>
            <stop offset="100%" stop-color="#00f0ff"/>
          </linearGradient>
        </defs>

        <!-- Compresor Scroll -->
        <circle cx="150" cy="200" r="45" fill="#111a2e" stroke="#ff0055" stroke-width="3"/>
        <text x="150" y="196" fill="#f8fafc" font-size="13" font-weight="bold" text-anchor="middle">COMPRESOR</text>
        <text x="150" y="214" fill="#ff0055" font-size="10" font-family="monospace" text-anchor="middle">Scroll Inverter</text>

        <!-- Tubería de Descarga (Gas Caliente Alta Presión) -->
        <path d="M 150 155 L 150 90 L 320 90" stroke="url(#hotGas)" stroke-width="4" fill="none"/>
        <text x="230" y="80" fill="#ff0055" font-size="10" font-weight="bold">Descarga Alta (28 bar)</text>

        <!-- Condensador Exterior -->
        <rect x="320" y="60" width="160" height="70" rx="6" fill="#1e1b4b" stroke="#f59e0b" stroke-width="2"/>
        <path d="M 335 75 Q 360 105 385 75 T 435 75" stroke="#f59e0b" stroke-width="2" fill="none"/>
        <text x="400" y="105" fill="#f59e0b" font-size="12" font-weight="bold" text-anchor="middle">CONDENSADOR</text>
        <text x="400" y="120" fill="#94a3b8" font-size="9" text-anchor="middle">Unidad Exterior</text>

        <!-- Válvula de Expansión Electrónica EEV -->
        <polygon points="460,200 500,180 500,220" fill="#ffd600" stroke="#fff" stroke-width="1.5"/>
        <polygon points="540,200 500,180 500,220" fill="#ffd600" stroke="#fff" stroke-width="1.5"/>
        <text x="500" y="165" fill="#ffd600" font-size="11" font-weight="bold" text-anchor="middle">Válvula EEV</text>
        <text x="500" y="240" fill="#94a3b8" font-size="9" text-anchor="middle">Expansión</text>

        <!-- Línea de Líquido -->
        <path d="M 480 95 L 500 95 L 500 180" stroke="#f59e0b" stroke-width="3" fill="none"/>
        <path d="M 500 220 L 500 320 L 480 320" stroke="url(#coldGas)" stroke-width="3" fill="none"/>

        <!-- Evaporador Interior -->
        <rect x="320" y="290" width="160" height="70" rx="6" fill="#0f2942" stroke="#00f0ff" stroke-width="2"/>
        <path d="M 335 305 Q 360 335 385 305 T 435 305" stroke="#00f0ff" stroke-width="2" fill="none"/>
        <text x="400" y="335" fill="#00f0ff" font-size="12" font-weight="bold" text-anchor="middle">EVAPORADOR</text>
        <text x="400" y="350" fill="#94a3b8" font-size="9" text-anchor="middle">Unidad Interior (Frío)</text>

        <!-- Retorno / Succión Baja Presión -->
        <path d="M 320 325 L 150 325 L 150 245" stroke="url(#coldGas)" stroke-width="4" fill="none"/>
        <text x="210" y="345" fill="#00f0ff" font-size="10" font-weight="bold">Succión Baja (7.5 bar)</text>

        <!-- Sensores y Puntos de Prueba -->
        <circle cx="210" cy="90" r="6" fill="#ffd600"/>
        <text x="210" y="112" fill="#ffd600" font-size="9" font-family="monospace">Punto HP</text>

        <circle cx="240" cy="325" r="6" fill="#00f0ff"/>
        <text x="240" y="312" fill="#00f0ff" font-size="9" font-family="monospace">Punto LP</text>
      </svg>
    `
  },
  {
    id: 'pump_exploded',
    title: 'Despiece Mecánico - Bomba Centrífuga Industrial',
    category: 'Mecánica & Hidráulica',
    description: 'Componentes críticos: rodamiento 6308, sello mecánico carburo de silicio, eje e impulsor cerrado.',
    svg: `
      <svg viewBox="0 0 600 420" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#090d16; border-radius:8px;">
        <!-- Eje Central Principal -->
        <rect x="50" y="195" width="480" height="20" rx="3" fill="#64748b" stroke="#cbd5e1" stroke-width="1.5"/>
        <text x="290" y="185" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">EJE DE ACERO INOXIDABLE AISI 316</text>

        <!-- Rodamiento Trasero Lado Motor (1) -->
        <g transform="translate(90, 160)">
          <rect x="0" y="0" width="40" height="90" rx="4" fill="#1e293b" stroke="#00f0ff" stroke-width="2"/>
          <circle cx="20" cy="20" r="10" fill="#334155" stroke="#00f0ff"/>
          <circle cx="20" cy="70" r="10" fill="#334155" stroke="#00f0ff"/>
          <text x="20" y="48" fill="#00f0ff" font-size="9" font-weight="bold" text-anchor="middle">[1]</text>
          <text x="20" y="106" fill="#94a3b8" font-size="9" text-anchor="middle">Rodamiento 6308</text>
        </g>

        <!-- Sello Mecánico y Caja de Prensaestopas (2) -->
        <g transform="translate(240, 150)">
          <rect x="0" y="0" width="50" height="110" rx="4" fill="#312e81" stroke="#ffd600" stroke-width="2"/>
          <line x1="10" y1="20" x2="40" y2="90" stroke="#ffd600" stroke-width="1.5"/>
          <line x1="40" y1="20" x2="10" y2="90" stroke="#ffd600" stroke-width="1.5"/>
          <text x="25" y="58" fill="#ffd600" font-size="9" font-weight="bold" text-anchor="middle">[2]</text>
          <text x="25" y="125" fill="#ffd600" font-size="9" text-anchor="middle">Sello Mecánico</text>
        </g>

        <!-- Impulsor / Rodete (3) -->
        <g transform="translate(380, 110)">
          <path d="M 0 30 L 60 0 L 80 85 L 80 115 L 60 200 L 0 170 Z" fill="#1e293b" stroke="#22c55e" stroke-width="2.5"/>
          <text x="40" y="105" fill="#22c55e" font-size="10" font-weight="bold" text-anchor="middle">[3]</text>
          <text x="40" y="215" fill="#22c55e" font-size="9" text-anchor="middle">Impulsor Cerrado</text>
        </g>

        <!-- Voluta / Carcasa Exterior (4) -->
        <g transform="translate(360, 70)">
          <path d="M -10 20 C 120 -30 180 80 170 200 C 160 280 110 320 -10 280" fill="none" stroke="#f43f5e" stroke-width="3" stroke-dasharray="6,4"/>
          <text x="140" y="50" fill="#f43f5e" font-size="11" font-weight="bold">[4] Carcasa Voluta</text>
        </g>

        <!-- Tuerca de Fijación y Chaveta -->
        <polygon points="480,190 500,190 495,220 475,220" fill="#e2e8f0" stroke="#475569"/>
        <text x="490" y="240" fill="#94a3b8" font-size="9">Tuerca Bloqueo</text>
      </svg>
    `
  },
  {
    id: 'fiber_rack',
    title: 'Rack & Bandeja de Fusión Fibra Óptica (TIA-598)',
    category: 'Telecomunicaciones & Redes',
    description: 'Bandeja de empalmes 24 hilos monomodo OS2 con distribución de colores estándar.',
    svg: `
      <svg viewBox="0 0 600 420" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:#090d16; border-radius:8px;">
        <!-- Marco Bandeja 1U -->
        <rect x="40" y="50" width="520" height="320" rx="8" fill="#0f172a" stroke="#00f0ff" stroke-width="2"/>
        <text x="60" y="78" fill="#00f0ff" font-size="12" font-weight="bold" font-family="monospace">BANDEJA DE EMPALMES OPTICAL PATCH 1U - RACK 19"</text>

        <!-- Guías de Tubo Holgado y Curvatura -->
        <circle cx="200" cy="210" r="45" fill="none" stroke="#334155" stroke-width="3"/>
        <circle cx="400" cy="210" r="45" fill="none" stroke="#334155" stroke-width="3"/>

        <!-- Código de Colores Fibras 1 a 12 (TIA-598) -->
        <g transform="translate(70, 110)">
          <text x="0" y="0" fill="#94a3b8" font-size="10" font-weight="bold">CÓDIGO DE COLORES TIA-598-C:</text>
          
          <rect x="0" y="15" width="30" height="12" fill="#2563eb" rx="2"/>
          <text x="36" y="25" fill="#e2e8f0" font-size="9">1. Azul</text>

          <rect x="90" y="15" width="30" height="12" fill="#f97316" rx="2"/>
          <text x="126" y="25" fill="#e2e8f0" font-size="9">2. Naranja</text>

          <rect x="180" y="15" width="30" height="12" fill="#22c55e" rx="2"/>
          <text x="216" y="25" fill="#e2e8f0" font-size="9">3. Verde</text>

          <rect x="270" y="15" width="30" height="12" fill="#78350f" rx="2"/>
          <text x="306" y="25" fill="#e2e8f0" font-size="9">4. Marrón</text>

          <rect x="360" y="15" width="30" height="12" fill="#64748b" rx="2"/>
          <text x="396" y="25" fill="#e2e8f0" font-size="9">5. Gris</text>

          <rect x="0" y="38" width="30" height="12" fill="#f8fafc" rx="2" stroke="#000"/>
          <text x="36" y="48" fill="#e2e8f0" font-size="9">6. Blanco</text>

          <rect x="90" y="38" width="30" height="12" fill="#ef4444" rx="2"/>
          <text x="126" y="48" fill="#e2e8f0" font-size="9">7. Rojo</text>

          <rect x="180" y="38" width="30" height="12" fill="#000000" rx="2" stroke="#475569"/>
          <text x="216" y="48" fill="#e2e8f0" font-size="9">8. Negro</text>

          <rect x="270" y="38" width="30" height="12" fill="#eab308" rx="2"/>
          <text x="306" y="48" fill="#e2e8f0" font-size="9">9. Amarillo</text>

          <rect x="360" y="38" width="30" height="12" fill="#a855f7" rx="2"/>
          <text x="396" y="48" fill="#e2e8f0" font-size="9">10. Violeta</text>
        </g>

        <!-- Peine de Fusiones Central -->
        <rect x="250" y="180" width="100" height="70" rx="4" fill="#1e293b" stroke="#ffd600" stroke-width="2"/>
        <text x="300" y="210" fill="#ffd600" font-size="10" font-weight="bold" text-anchor="middle">PEINE FUSIONES</text>
        <line x1="260" y1="225" x2="340" y2="225" stroke="#ef4444" stroke-width="2"/>
        <line x1="260" y1="235" x2="340" y2="235" stroke="#22c55e" stroke-width="2"/>
        <text x="300" y="247" fill="#94a3b8" font-size="8" text-anchor="middle">Manguitos Termorretráctiles</text>

        <!-- Puertos Adaptadores LC Dúplex -->
        <g transform="translate(70, 300)">
          <rect x="0" y="0" width="460" height="45" rx="4" fill="#020617" stroke="#334155"/>
          <text x="10" y="25" fill="#00f0ff" font-size="9" font-family="monospace">PUERTOS LC (1-12)</text>
          
          <rect x="130" y="10" width="20" height="25" fill="#0284c7" rx="2"/>
          <rect x="160" y="10" width="20" height="25" fill="#0284c7" rx="2"/>
          <rect x="190" y="10" width="20" height="25" fill="#0284c7" rx="2"/>
          <rect x="220" y="10" width="20" height="25" fill="#0284c7" rx="2"/>
          <rect x="250" y="10" width="20" height="25" fill="#0284c7" rx="2"/>
          <rect x="280" y="10" width="20" height="25" fill="#0284c7" rx="2"/>
          <text x="320" y="25" fill="#22c55e" font-size="10" font-weight="bold">Atenuación &lt; 0.2 dB</text>
        </g>
      </svg>
    `
  }
];

export class SchematicsManager {
  constructor(options = {}) {
    this.schematics = [...BUILTIN_SCHEMATICS];
    this.activeSchematic = null;
    this.onSelectSchematic = options.onSelectSchematic || (() => {});
    this.onPushToField = options.onPushToField || (() => {});
  }

  getAll() {
    return this.schematics;
  }

  getById(id) {
    return this.schematics.find(s => s.id === id) || null;
  }

  addCustomSchematic(schematic) {
    this.schematics.unshift(schematic);
    return schematic;
  }

  setActive(id) {
    const found = this.getById(id);
    if (found) {
      this.activeSchematic = found;
      this.onSelectSchematic(found);
    }
    return found;
  }

  pushActiveToField() {
    if (this.activeSchematic) {
      this.onPushToField(this.activeSchematic);
    }
  }
}
