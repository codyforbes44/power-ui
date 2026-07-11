#!/usr/bin/env python3
"""
Async v2 — Local Server
Stdlib only · Python 3.8+ · No external dependencies

  • Serves app/ as static files (enables crypto.subtle on localhost)
  • Persists state to data/ directory on disk
  • SSE endpoint for real-time multi-device sync
  • MCP stdio bridge — spawns local MCP processes and exposes them as HTTP

Usage:
  python3 server.py                        # http://127.0.0.1:8080
  python3 server.py --port 9000
  python3 server.py --host 0.0.0.0        # expose on LAN (multi-device sync)
  DEBUG=1 python3 server.py               # verbose request logging
"""

import http.server
import json
import mimetypes
import os
import queue
import subprocess
import sys
import threading
import time
import uuid
import argparse
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

# ── Paths ────────────────────────────────────────────────────────────────────
APP_DIR    = Path(__file__).parent.resolve()          # .../Claude/app/
ROOT_DIR   = APP_DIR.parent.resolve()                 # .../Claude/
PUBLIC_DIR = ROOT_DIR / 'public'                      # .../Claude/public/
DATA_DIR   = ROOT_DIR / 'data'                        # .../Claude/data/

STATE_FILE = DATA_DIR / 'state.json'

# ── SSE clients registry ──────────────────────────────────────────────────────
_sse_clients: dict[str, queue.Queue] = {}
_sse_lock = threading.Lock()

# ── MCP stdio processes registry ──────────────────────────────────────────────
_mcp_procs: dict[str, dict] = {}
_mcp_lock  = threading.Lock()

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _notify_sse(event_type: str, data: Optional[dict] = None) -> None:
    """Broadcast a message to all connected SSE clients."""
    msg = json.dumps({'type': event_type, **(data or {})})
    dead = []
    with _sse_lock:
        for cid, q in _sse_clients.items():
            try:
                q.put_nowait(msg)
            except queue.Full:
                dead.append(cid)
        for cid in dead:
            del _sse_clients[cid]


def _read_json(path: Path, default):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        pass
    return default


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    tmp.replace(path)  # atomic rename


def _mcp_rpc(proc: subprocess.Popen, method: str, params: Optional[dict] = None, timeout: float = 8.0):
    """Send one JSON-RPC request to an MCP stdio process and return the result dict."""
    req_id = str(uuid.uuid4())[:8]
    request = json.dumps({'jsonrpc': '2.0', 'id': req_id, 'method': method, 'params': params or {}}) + '\n'
    try:
        proc.stdin.write(request.encode())
        proc.stdin.flush()
        deadline = time.monotonic() + timeout
        buf = b''
        while time.monotonic() < deadline:
            ch = proc.stdout.read(1)
            if not ch:
                break
            buf += ch
            if buf.endswith(b'\n'):
                try:
                    resp = json.loads(buf.decode())
                    if str(resp.get('id')) == req_id:
                        if 'error' in resp:
                            return {'error': resp['error']}
                        return resp.get('result', {})
                    buf = b''  # different id — keep reading
                except json.JSONDecodeError:
                    buf = b''
    except Exception as exc:
        return {'error': str(exc)}
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Request Handler
# ─────────────────────────────────────────────────────────────────────────────

class Handler(http.server.BaseHTTPRequestHandler):

    # ── Logging ──────────────────────────────────────────────
    def log_message(self, fmt, *args):
        if os.environ.get('DEBUG'):
            super().log_message(fmt, *args)

    # ── Utilities ─────────────────────────────────────────────
    def _check_mcp_origin(self) -> bool:
        origin = self.headers.get('Origin')
        if not origin:
            return True  # Allow non-browser requests or same-origin direct navigation
        
        parsed_origin = urlparse(origin)
        origin_host = parsed_origin.netloc.lower()
        host = self.headers.get('Host', '').lower()
        
        if not host:
            return False
            
        if origin_host == host:
            return True
            
        if any(lh in origin_host for lh in ['localhost', '127.0.0.1', '[::1]']):
            if any(lh in host for lh in ['localhost', '127.0.0.1', '[::1]']):
                return True
                
        return False

    def _is_safe_mcp_command(self, command: str, args: list) -> bool:
        base_cmd = os.path.basename(command).lower()
        
        # Strip extensions
        for ext in ['.exe', '.cmd', '.bat']:
            if base_cmd.endswith(ext):
                base_cmd = base_cmd[:-len(ext)]
                
        # Default allowed commands
        allowed = {
            'node', 'npm', 'npx',
            'python', 'python3',
            'uv', 'uvx',
            'bun', 'deno',
            'git', 'docker'
        }
        
        # Allow custom commands via environment variable if needed
        env_allowed = os.environ.get('ALLOWED_MCP_COMMANDS')
        if env_allowed:
            custom_set = {c.strip().lower() for c in env_allowed.split(',') if c.strip()}
            allowed.update(custom_set)
            
        if base_cmd not in allowed:
            return False
            
        # Check arguments for code-execution flags
        args_lower = [str(a).lower() for a in args]
        
        if base_cmd in ('node', 'bun', 'deno'):
            # Block: -e, --eval, -p, --print
            for arg in args_lower:
                if arg in ('-e', '--eval', '-p', '--print'):
                    return False
                # Check for combined flags (e.g. -pe, -ep, -e=code, etc)
                if arg.startswith('-') and not arg.startswith('--'):
                    if 'e' in arg or 'p' in arg:
                        return False
                if arg.startswith('--eval='):
                    return False
                    
        elif base_cmd in ('python', 'python3'):
            # Block: -c, -i
            for arg in args_lower:
                if arg in ('-c', '-i'):
                    return False
                # Check for combined flags (e.g. -ci, -ic, etc)
                if arg.startswith('-') and not arg.startswith('--'):
                    if 'c' in arg or 'i' in arg:
                        return False
                        
        return True

    def _cors(self):
        origin = self.headers.get('Origin')
        if origin:
            parsed_origin = urlparse(origin)
            origin_host = parsed_origin.netloc.lower()
            host = self.headers.get('Host', '').lower()
            is_safe = (origin_host == host) or (
                any(lh in origin_host for lh in ['localhost', '127.0.0.1', '[::1]']) and
                any(lh in host for lh in ['localhost', '127.0.0.1', '[::1]'])
            )
            if is_safe:
                self.send_header('Access-Control-Allow-Origin', origin)
            else:
                self.send_header('Access-Control-Allow-Origin', 'null')
        else:
            self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def _security_headers(self):
        """Security headers that belong in HTTP (not meta tags)."""
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy',
            "frame-ancestors 'none'; "
            "default-src 'self' https://esm.sh; "
            "script-src 'self' 'unsafe-inline' https://unpkg.com https://identity.netlify.com https://esm.sh https://*.firebasejs.com https://www.gstatic.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com https://frontend-cdn.perplexity.ai data:; "
            "connect-src 'self' https://www.gstatic.com https://api.anthropic.com https://api.openai.com "
            "https://generativelanguage.googleapis.com https://api.groq.com "
            "https://api.mistral.ai https://api.bfl.ml https://fal.run "
            "https://*.fal.run https://*.fal.media "
            "https://api.replicate.com https://api-inference.huggingface.co http://127.0.0.1:8188 http://localhost:8188 "
            "https://unpkg.com https://identity.netlify.com https://*.netlify.com "
            "https://api.elevenlabs.io wss://api.elevenlabs.io https://elevenlabs.io "
            "https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://esm.sh https://www.gstatic.com; "
            "frame-src blob: https://identity.netlify.com; "
            "img-src 'self' data: blob: https://*.fal.run https://*.fal.media https://*.replicate.delivery; "
            "worker-src blob:;"
        )

    def _json(self, data, status: int = 200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _err(self, msg: str, status: int = 400):
        self._json({'error': msg}, status)

    def _body(self) -> bytes:
        length = int(self.headers.get('Content-Length', 0))
        return self.rfile.read(length) if length else b''

    def _json_body(self) -> dict:
        try:
            return json.loads(self._body()) or {}
        except Exception:
            return {}

    # ── CORS preflight ────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    # ── GET ───────────────────────────────────────────────────
    def do_GET(self):
        path = urlparse(self.path).path.rstrip('/') or '/'

        if path.startswith('/api/mcp'):
            if not self._check_mcp_origin():
                return self._err('Forbidden: Untrusted origin', 403)

        if path == '/api/ping':
            self._json({
                'status':     'ok',
                'version':    '2.0',
                'serverMode': True,
                'sync':       True,
                'clients':    len(_sse_clients),
                'mcpProcs':   len(_mcp_procs),
            })

        elif path == '/api/state':
            self._json(_read_json(STATE_FILE, {}))

        elif path == '/api/sync':
            self._sse_stream()

        elif path == '/api/mcp/list':
            with _mcp_lock:
                items = [
                    {
                        'id':        k,
                        'name':      v['name'],
                        'command':   v['command'],
                        'startedAt': v['startedAt'],
                        'alive':     v['process'].poll() is None,
                    }
                    for k, v in _mcp_procs.items()
                ]
            self._json(items)

        elif path.startswith('/api/mcp/') and path.endswith('/tools'):
            mcp_id = path.split('/')[3]
            self._mcp_get_tools(mcp_id)

        else:
            self._static(path)

    # ── PUT ───────────────────────────────────────────────────
    def do_PUT(self):
        path = urlparse(self.path).path.rstrip('/')

        if path == '/api/state':
            try:
                data = json.loads(self._body())
                _write_json(STATE_FILE, data)
                _notify_sse('state-changed', {'ts': int(time.time() * 1000)})
                self._json({'ok': True})
            except Exception as exc:
                self._err(str(exc))
        else:
            self._err('Not found', 404)

    # ── POST ──────────────────────────────────────────────────
    def do_POST(self):
        path = urlparse(self.path).path.rstrip('/')
        payload = self._json_body()

        if path.startswith('/api/mcp'):
            if not self._check_mcp_origin():
                return self._err('Forbidden: Untrusted origin', 403)

        if path == '/api/mcp/start':
            self._mcp_start(payload)

        elif path.startswith('/api/mcp/') and path.endswith('/call'):
            mcp_id = path.split('/')[3]
            self._mcp_call(mcp_id, payload)

        else:
            self._err('Not found', 404)

    # ── DELETE ────────────────────────────────────────────────
    def do_DELETE(self):
        path = urlparse(self.path).path.rstrip('/')

        if path.startswith('/api/mcp'):
            if not self._check_mcp_origin():
                return self._err('Forbidden: Untrusted origin', 403)

        if path.startswith('/api/mcp/'):
            mcp_id = path.split('/')[3]
            with _mcp_lock:
                entry = _mcp_procs.pop(mcp_id, None)
            if entry:
                try:
                    entry['process'].terminate()
                except Exception:
                    pass
                self._json({'ok': True})
            else:
                self._err('Process not found', 404)
        else:
            self._err('Not found', 404)

    # ── SSE stream ────────────────────────────────────────────
    def _sse_stream(self):
        client_id = uuid.uuid4().hex[:10]
        q: queue.Queue = queue.Queue(maxsize=100)
        with _sse_lock:
            _sse_clients[client_id] = q

        self.send_response(200)
        self.send_header('Content-Type',  'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection',    'keep-alive')
        self.send_header('X-Accel-Buffering', 'no')   # nginx compat
        self._cors()
        self.end_headers()

        self._sse_write({'type': 'connected', 'clientId': client_id})

        try:
            while True:
                try:
                    msg = q.get(timeout=20)
                    self._sse_write(json.loads(msg))
                except queue.Empty:
                    self._sse_write({'type': 'heartbeat', 'ts': int(time.time() * 1000)})
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with _sse_lock:
                _sse_clients.pop(client_id, None)

    def _sse_write(self, data: dict):
        self.wfile.write(f'data: {json.dumps(data)}\n\n'.encode())
        self.wfile.flush()

    # ── MCP stdio bridge ──────────────────────────────────────
    def _mcp_start(self, payload: dict):
        command = payload.get('command', '').strip()
        args    = payload.get('args', [])
        name    = payload.get('name') or command
        env_ext = payload.get('env', {})

        if not command:
            return self._err('command is required')

        if not self._is_safe_mcp_command(command, args):
            return self._err('Forbidden command or arguments', 403)

        try:
            env = {**os.environ, **{str(k): str(v) for k, v in env_ext.items()}}
            proc = subprocess.Popen(
                [command] + [str(a) for a in args],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                cwd=str(APP_DIR.parent),
            )

            # MCP handshake: initialize
            init_result = _mcp_rpc(proc, 'initialize', {
                'protocolVersion': '2024-11-05',
                'capabilities':    {},
                'clientInfo':      {'name': 'async-ai', 'version': '2.0'},
            }, timeout=6)

            if init_result is None:
                proc.terminate()
                stderr_out = proc.stderr.read(500).decode(errors='replace')
                return self._err(f'MCP server did not respond to initialize. Stderr: {stderr_out}')

            # Send initialized notification (no response expected)
            notif = json.dumps({'jsonrpc': '2.0', 'method': 'notifications/initialized'}) + '\n'
            proc.stdin.write(notif.encode())
            proc.stdin.flush()

            mcp_id = uuid.uuid4().hex[:8]
            with _mcp_lock:
                _mcp_procs[mcp_id] = {
                    'process':   proc,
                    'name':      name,
                    'command':   command,
                    'args':      args,
                    'startedAt': int(time.time() * 1000),
                }

            self._json({'id': mcp_id, 'name': name, 'status': 'running'})

        except FileNotFoundError:
            self._err(f'Command not found: {command}')
        except Exception as exc:
            self._err(str(exc))

    def _mcp_get_tools(self, mcp_id: str):
        with _mcp_lock:
            entry = _mcp_procs.get(mcp_id)
        if not entry:
            return self._err('Process not found', 404)
        if entry['process'].poll() is not None:
            return self._err('Process has exited', 410)
        result = _mcp_rpc(entry['process'], 'tools/list')
        tools = result.get('tools', []) if isinstance(result, dict) else []
        self._json({'id': mcp_id, 'name': entry['name'], 'tools': tools})

    def _mcp_call(self, mcp_id: str, payload: dict):
        with _mcp_lock:
            entry = _mcp_procs.get(mcp_id)
        if not entry:
            return self._err('Process not found', 404)
        tool   = payload.get('tool', '')
        params = payload.get('params', {})
        if not tool:
            return self._err('tool is required')
        result = _mcp_rpc(entry['process'], 'tools/call', {'name': tool, 'arguments': params}, timeout=30)
        self._json({'result': result, 'tool': tool})

    # ── Static file serving ───────────────────────────────────
    def _static(self, url_path: str):
        """
        URL routing:
          /               → public/index.html  (marketing homepage)
          /public/*       → public/            (marketing site assets)
          /app/*          → app/               (the actual application)
          /*              → app/               (default, backwards-compatible)
        """
        rel = url_path.lstrip('/')

        # Root → redirect to public homepage
        if not rel or rel == '':
            self.send_response(302)
            self.send_header('Location', '/public/index.html')
            self.end_headers()
            return

        # Determine which base directory to use
        if rel.startswith('public/'):
            base_dir = PUBLIC_DIR
            rel      = rel[len('public/'):] or 'index.html'
        elif rel.startswith('app/'):
            base_dir = APP_DIR
            rel      = rel[len('app/'):] or 'index.html'
        else:
            # Legacy / direct asset access — serve from app dir
            base_dir = APP_DIR

        file_path = (base_dir / rel).resolve()

        # Security: block path traversal outside allowed roots
        try:
            file_path.relative_to(APP_DIR)
        except ValueError:
            try:
                file_path.relative_to(PUBLIC_DIR)
            except ValueError:
                self.send_response(403)
                self.end_headers()
                return

        if not file_path.is_file():
            # SPA fallback: serve base dir index.html
            file_path = base_dir / 'index.html'
            if not file_path.is_file():
                self.send_response(404)
                self.end_headers()
                return

        mime, _ = mimetypes.guess_type(str(file_path))
        content  = file_path.read_bytes()

        self.send_response(200)
        self.send_header('Content-Type',   mime or 'application/octet-stream')
        self.send_header('Content-Length', str(len(content)))
        # No-cache HTML + security headers; long-cache everything else
        if mime == 'text/html':
            self.send_header('Cache-Control', 'no-store')
            self._security_headers()
        else:
            self.send_header('Cache-Control', 'max-age=86400')
        self.end_headers()
        self.wfile.write(content)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Async v2 — Local Server',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 server.py
  python3 server.py --port 9000
  python3 server.py --host 0.0.0.0    # expose on LAN for multi-device sync
  DEBUG=1 python3 server.py           # verbose logging
        """
    )
    parser.add_argument('--host', default='127.0.0.1',
                        help='Interface to bind (default: 127.0.0.1; use 0.0.0.0 for LAN)')
    parser.add_argument('--port', type=int, default=8080,
                        help='Port to listen on (default: 8080)')
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Use ThreadingHTTPServer so SSE streams don't block other requests
    server = http.server.ThreadingHTTPServer((args.host, args.port), Handler)

    print(f'\n  ✦  Async v2  —  Local Server\n')
    print(f'  → App:        http://{args.host}:{args.port}')
    print(f'  → Admin:      http://{args.host}:{args.port}/admin.html')
    print(f'  → Data dir:   {DATA_DIR}')
    print(f'  → SSE sync:   enabled (multi-device)')
    print(f'  → MCP bridge: enabled (stdio processes)')
    print(f'\n  Press Ctrl+C to stop\n')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  ✦  Stopping server…')
        # Terminate all MCP child processes
        with _mcp_lock:
            for entry in _mcp_procs.values():
                try:
                    entry['process'].terminate()
                except Exception:
                    pass
        server.shutdown()
        print('  ✦  Done.\n')


if __name__ == '__main__':
    main()
