import http.server
import json
import base64

class MockComfyUI(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        if self.path.startswith('/system_stats'):
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"system": "mock"}')
        elif self.path.startswith('/history/12345'):
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            history = {
                "12345": {
                    "status": {"completed": True},
                    "outputs": {"9": {"images": [{"filename": "test.png", "subfolder": "", "type": "output"}]}}
                }
            }
            self.wfile.write(json.dumps(history).encode('utf-8'))
        elif self.path.startswith('/view'):
            self.send_header('Content-Type', 'image/png')
            self.end_headers()
            img = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
            self.wfile.write(img)
        else:
            self.end_headers()
            
    def do_POST(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"prompt_id": "12345"}')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    http.server.HTTPServer(('127.0.0.1', 8188), MockComfyUI).serve_forever()
