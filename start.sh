#!/bin/bash
set -e

PORT="${PORT:-8080}"

# Start the Readium publication server on internal port 18080
readium serve --address 0.0.0.0 --port 18080 --file-directory /epubs &
READIUM_PID=$!

echo "Readium server started on port 18080 (PID: $READIUM_PID)"

# Wait for readium to start
sleep 2

# Start a simple HTTP proxy on the public PORT that:
# - Returns 200 OK for GET / (Railway healthcheck)
# - Proxies everything else to the readium server on 18080
python3 - <<'PYEOF' &
import http.server
import urllib.request
import urllib.error
import os
import sys

PORT = int(os.environ.get('PORT', 8080))
READIUM_PORT = 18080

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress access logs

    def do_GET(self):
        if self.path == '/' or self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'Readium Publication Server OK\n')
            return
        self._proxy()

    def do_HEAD(self):
        if self.path == '/' or self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            return
        self._proxy()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

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

server = http.server.HTTPServer(('0.0.0.0', PORT), ProxyHandler)
print(f'Proxy listening on port {PORT}, forwarding to Readium on {READIUM_PORT}')
sys.stdout.flush()
server.serve_forever()
PYEOF

PROXY_PID=$!
echo "Proxy started on port $PORT (PID: $PROXY_PID)"

# Wait for either process to exit
wait $READIUM_PID $PROXY_PID
