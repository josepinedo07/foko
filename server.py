#!/usr/bin/env python3
"""
FieldLens - servidor estático para desarrollo.

  python3 server.py            -> HTTP  en :8000  (localhost)
  python3 server.py --https    -> HTTPS en :8443  (para probar con un teléfono
                                  en la misma Wi-Fi; genera un certificado
                                  autofirmado con openssl la primera vez)
"""

import http.server
import socketserver
import socket
import json
import os
import ssl
import subprocess
import sys

HTTP_PORT = 8000
HTTPS_PORT = 8443
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CERT_DIR = os.path.join(DIRECTORY, ".cert")
CERT_FILE = os.path.join(CERT_DIR, "cert.pem")
KEY_FILE = os.path.join(CERT_DIR, "key.pem")


def _is_private(ip):
    return (
        ip.startswith("192.168.")
        or ip.startswith("10.")
        or any(ip.startswith(f"172.{n}.") for n in range(16, 32))
    )


def local_ips():
    """All private IPv4 addresses of this machine, best guess first."""
    found = []

    def add(ip):
        if ip and _is_private(ip) and ip not in found:
            found.append(ip)

    # macOS: Wi-Fi / Ethernet interfaces
    for iface in ("en0", "en1", "en2"):
        try:
            out = subprocess.run(
                ["ipconfig", "getifaddr", iface], capture_output=True, text=True, timeout=2
            )
            add(out.stdout.strip())
        except Exception:
            pass

    # Fallback: routable source address
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        add(s.getsockname()[0])
        s.close()
    except Exception:
        pass

    # Prefer 192.168.* (typical home Wi-Fi) for the phone hint
    found.sort(key=lambda ip: 0 if ip.startswith("192.168.") else 1)
    return found or ["127.0.0.1"]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == "/__ips":
            body = json.dumps({"ips": local_ips()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".js"):
            return "application/javascript"
        if path.endswith(".css"):
            return "text/css"
        return super().guess_type(path)

    def log_message(self, *args):
        pass


def ensure_cert(ips):
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        return
    os.makedirs(CERT_DIR, exist_ok=True)
    print(" Generando certificado autofirmado (.cert/)...")
    san = "subjectAltName=DNS:localhost,IP:127.0.0.1," + ",".join(f"IP:{ip}" for ip in ips)
    subprocess.run(
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", KEY_FILE, "-out", CERT_FILE, "-days", "825",
            "-subj", "/CN=FieldLens", "-addext", san,
        ],
        check=True,
    )


def run():
    os.chdir(DIRECTORY)
    use_https = "--https" in sys.argv
    ips = local_ips()
    port = HTTPS_PORT if use_https else HTTP_PORT
    scheme = "https" if use_https else "http"

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("", port), Handler)

    if use_https:
        try:
            ensure_cert(ips)
        except (FileNotFoundError, subprocess.CalledProcessError) as e:
            print(f" No se pudo generar el certificado: {e}")
            sys.exit(1)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(CERT_FILE, KEY_FILE)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    print("\n" + "=" * 60)
    print(" FieldLens - Soporte remoto por video")
    print("=" * 60)
    print(f"\n Servidor {scheme.upper()} en :{port}\n")
    print(f"   Esta compu:   {scheme}://localhost:{port}/remote-expert.html")
    if use_https:
        for ip in ips:
            print(f"   Teléfono:     {scheme}://{ip}:{port}/   (usa la IP de tu Wi-Fi)")
        print("\n En el teléfono el navegador mostrará un aviso de seguridad")
        print(" (certificado autofirmado): entra en 'Avanzado' y continúa.")
    else:
        print("\n Para probar con un teléfono:  python3 server.py --https")
    print("\n" + "=" * 60)
    print(" Ctrl+C para detener.\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo...")
        httpd.shutdown()


if __name__ == "__main__":
    run()
