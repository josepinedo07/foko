#!/usr/bin/env python3
"""
FieldLens AR - Tactical Web & Realtime Server
Serves static files with proper MIME types and prints local LAN connection info.
"""

import http.server
import socketserver
import socket
import os
import sys
import json

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class FieldLensHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == '/api/info':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            payload = json.dumps({
                "local_ip": get_local_ip(),
                "port": PORT,
                "status": "online"
            })
            self.wfile.write(payload.encode('utf-8'))
            return
        super().do_GET()

    def end_headers(self):
        # Enable CORS and Cache-Control for rapid development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def guess_type(self, path):
        mime = super().guess_type(path)
        if path.endswith('.js'):
            return 'application/javascript'
        if path.endswith('.css'):
            return 'text/css'
        if path.endswith('.svg'):
            return 'image/svg+xml'
        return mime

def run():
    os.chdir(DIRECTORY)
    local_ip = get_local_ip()

    print("\n" + "=" * 64)
    print(" 🚀 FIELDLENS AR - ASISTENCIA TÉCNICA REMOTA CON REALIDAD AUMENTADA")
    print("=" * 64)
    print(f"\n [✓] Servidor activo en puerto {PORT}")
    print(f" [✓] Directorio raíz: {DIRECTORY}\n")
    print(f" 🌐 ACCESO LOCAL (Este ordenador):")
    print(f"     👉 Banco de Pruebas Dual: http://localhost:{PORT}/simulator.html")
    print(f"     👉 Panel Principal:       http://localhost:{PORT}/")
    print(f"     👉 Cockpit de Experto:    http://localhost:{PORT}/remote-expert.html?room=SALA-1\n")
    print(f" 📱 ACCESO EN RED LOCAL (Smartphone en la misma Wi-Fi):")
    print(f"     👉 Técnico en Campo:      http://{local_ip}:{PORT}/field-tech.html?room=SALA-1\n")
    print("=" * 64)
    print(" Presiona Ctrl+C para detener el servidor.\n")

    # Reuse address to avoid port already in use errors on restart
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), FieldLensHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nDeteniendo servidor FieldLens AR...")
            httpd.shutdown()

if __name__ == '__main__':
    run()
