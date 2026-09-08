/**
 * FOKO — límites operativos del servicio.
 * Un solo lugar para ajustarlos. Se importan desde las páginas y la función
 * serverless los replica (api/report.js) porque no comparte bundler.
 */

// Corte duro de la videollamada. Evita que una sesión quede abierta
// indefinidamente (cámara encendida, ancho de banda de TURN, riesgo).
export const SESSION_MAX_MINUTES = 30;

// Aviso previo al corte.
export const SESSION_WARN_MINUTES = 25;

// Tope de fotos que se guardan en el historial por sesión.
export const MAX_PHOTOS_PER_SESSION = 40;

// Tope de caracteres (transcripción + notas) que se mandan al reporte con IA.
export const MAX_REPORT_CHARS = 20000;

export const SESSION_MAX_MS = SESSION_MAX_MINUTES * 60 * 1000;
export const SESSION_WARN_MS = SESSION_WARN_MINUTES * 60 * 1000;
