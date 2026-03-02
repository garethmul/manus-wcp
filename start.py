#!/usr/bin/env python3
"""
Readium Publication Server launcher.
Starts the Readium CLI on port 18080, then runs a lightweight
HTTP proxy on $PORT that:
  - Returns 200 OK on GET / and GET /health (Railway healthcheck)
  - Proxies all other requests to the Readium server
"""
import http.server
import urllib.request
import urllib.error
import subprocess
import threading
import os
import sys
import time

PORT = int(os.environ.get('PORT', 8080))
READIUM_PORT = 18080
READIUM_BIN = '/app/readium'
EPUBS_DIR = os.path.join(os.path.dirname(__file__), 'epubs')

# Start the Readium CLI publication server
print(f"Starting Readium CLI on port {READIUM_PORT}...")
sys.stdout.flush()

readium_proc = subprocess.Popen(
    [READIUM_BIN, 'serve',
     '--address', '0.0.0.0',
     '--port', str(READIUM_PORT),
     '--file-directory', EPUBS_DIR],
    stdout=sys.stdout,
    stderr=sys.stderr
)

# Give it a moment to start
time.sleep(2)
print(f"Readium CLI started (PID {readium_proc.pid})")
sys.stdout.flush()


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress per-request logs

    def do_GET(self):
        if self.path in ('/', '/health'):
            self._ok()
        else:
            self._proxy()

    def do_HEAD(self):
        if self.path in ('/', '/health'):
            self._ok()
        else:
            self._proxy()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def _ok(self):
        body = b'Readium Publication Server OK\n'
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self):
        url = f'http://localhost:{READIUM_PORT}{self.path}'
        try:
            headers = {k: v for k, v in self.headers.items()
                       if k.lower() not in ('host', 'connection')}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as resp:
                self.send_response(resp.status)
                for key, val in resp.headers.items():
                    if key.lower() not in ('transfer-encoding', 'connection'):
                        self.send_header(key, val)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())


def monitor_readium():
    """Restart Readium if it crashes."""
    global readium_proc
    while True:
        readium_proc.wait()
        print("Readium CLI exited, restarting...")
        sys.stdout.flush()
        time.sleep(1)
        readium_proc = subprocess.Popen(
            [READIUM_BIN, 'serve',
             '--address', '0.0.0.0',
             '--port', str(READIUM_PORT),
             '--file-directory', EPUBS_DIR],
            stdout=sys.stdout,
            stderr=sys.stderr
        )


monitor_thread = threading.Thread(target=monitor_readium, daemon=True)
monitor_thread.start()

print(f"Proxy listening on port {PORT}, forwarding to Readium on {READIUM_PORT}")
sys.stdout.flush()

server = http.server.HTTPServer(('0.0.0.0', PORT), ProxyHandler)
server.serve_forever()
