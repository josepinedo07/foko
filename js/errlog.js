/**
 * FOKO — captura de errores de cliente. Manda a /api/log (best-effort).
 * Script normal (no módulo) para cargar temprano en el <head> y atrapar
 * también errores de los <script type="module">.
 */
(function () {
  var seen = {};
  var sent = 0;
  var MAX = 8;

  function report(message, stack) {
    if (sent >= MAX) return;
    var key = String(message || '') + String(stack || '').slice(0, 200);
    if (seen[key]) return;
    seen[key] = 1; sent++;

    var body = {
      page: location.pathname,
      message: String(message || '').slice(0, 500),
      stack: String(stack || '').slice(0, 4000),
      ua: navigator.userAgent.slice(0, 300),
    };
    try {
      var k = Object.keys(localStorage).filter(function (x) {
        return x.indexOf('sb-') === 0 && x.indexOf('-auth-token') > 0;
      })[0];
      if (k) {
        var t = JSON.parse(localStorage.getItem(k));
        body.user_id = (t && t.user && t.user.id) || null;
      }
    } catch (e) {}

    try {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  window.addEventListener('error', function (e) {
    report(e.message, (e.error && e.error.stack) || (e.filename + ':' + e.lineno + ':' + e.colno));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    report('unhandledrejection: ' + (r.message || r), r.stack);
  });
})();
