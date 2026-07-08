#!/usr/bin/env python3
"""
Claude Power UI — Netlify Deploy Script
Deploys static files AND serverless functions via Netlify's file-digest API.
No Node, npm, or CLI required — Python 3 stdlib only.

Usage:
    python3 deploy.py
"""

import hashlib, io, json, os, sys, time, urllib.request, urllib.error, zipfile
from pathlib import Path

ROOT       = Path(__file__).parent.resolve()
TOKEN_FILE = ROOT / '.netlify-token'
SITE_FILE  = ROOT / '.netlify-site'
API        = 'https://api.netlify.com/api/v1'

# ── Exclusions ────────────────────────────────────────────────────
EXCLUDE = {
    'app/server.py', 'app/cli.py',
    'data', 'skills', '.git',
    '.netlify-token', '.netlify-site',
    'deploy.py', '.gitignore', '.netlifyignore',
    '__pycache__',
}

FUNCTIONS_DIR = 'netlify/functions'
FUNC_EXTS     = {'.js', '.mjs', '.cjs', '.ts'}

# ── API helpers ───────────────────────────────────────────────────

def _request(method, path, body=None, binary=None, ctype='application/json', token=None):
    url = f'{API}{path}'
    data, headers = None, {'Authorization': f'Bearer {token}'}
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    elif binary is not None:
        data = binary
        headers['Content-Type'] = ctype
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        print(f'\n❌ API {e.code}: {txt[:300]}')
        sys.exit(1)

def sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()

def sha1_file(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

# ── File collection ───────────────────────────────────────────────

def excluded(rel: str) -> bool:
    parts = Path(rel).parts
    for pat in EXCLUDE:
        pp = Path(pat).parts
        if parts[:len(pp)] == pp:
            return True
    return False

def collect():
    static    = {}   # web_path → disk_path
    functions = {}   # func_name → (disk_path, zip_bytes, sha)

    for p in ROOT.rglob('*'):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT).as_posix()
        if excluded(rel):
            continue

        if rel.startswith(FUNCTIONS_DIR + '/') and p.suffix in FUNC_EXTS:
            # Bundle function into a zip
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.write(p, p.name)
            zipped = buf.getvalue()
            functions[p.stem] = (p, zipped, sha1(zipped))
        else:
            static['/' + rel] = p

    return static, functions

# ── Deploy ────────────────────────────────────────────────────────

def main():
    # Token
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text().strip()
        print('🔑 Using saved token')
    else:
        print('🔑 Netlify personal access token required.')
        print('   https://app.netlify.com/user/applications/personal')
        token = input('   Paste token: ').strip()
        if not token:
            sys.exit('No token.')
        TOKEN_FILE.write_text(token)
        os.chmod(TOKEN_FILE, 0o600)

    # Site
    if SITE_FILE.exists():
        site_id = SITE_FILE.read_text().strip()
        print(f'🌐 Site: {site_id}')
    else:
        site = _request('POST', '/sites', {'name': 'claude-power-ui'}, token=token)
        site_id = site['id']
        SITE_FILE.write_text(site_id)
        print(f'🌐 Created: {site.get("ssl_url")}')

    # Collect
    print('📋 Collecting files…')
    static, functions = collect()
    print(f'   {len(static)} static, {len(functions)} function(s): {list(functions)}')

    # Build digests
    file_shas  = {wp: sha1_file(dp) for wp, dp in static.items()}
    func_shas  = {name: data[2] for name, data in functions.items()}

    # Create deploy
    print('🚀 Creating deploy…')
    deploy = _request('POST', f'/sites/{site_id}/deploys', {
        'files':     file_shas,
        'functions': func_shas,
        'async':     False,
    }, token=token)
    did = deploy['id']
    req_files = set(deploy.get('required', []))
    req_funcs = set(deploy.get('required_functions', []))
    print(f'   ID: {did}  |  need {len(req_files)} files + {len(req_funcs)} function(s)')

    # Upload missing static files
    if req_files:
        sha_to_disk = {sha1_file(dp): dp for dp in static.values()
                       if sha1_file(dp) in req_files}
        for i, s in enumerate(req_files, 1):
            if s in sha_to_disk:
                p = sha_to_disk[s]
                print(f'   File {i}/{len(req_files)}: {p.name}' + ' '*20, end='\r')
                _request('PUT', f'/deploys/{did}/files/{s}',
                         binary=p.read_bytes(),
                         ctype='application/octet-stream', token=token)
        print(f'   ✓ {len(req_files)} files uploaded' + ' '*20)

    # Upload missing functions
    if req_funcs:
        for name, (_, zipped, s) in functions.items():
            if s in req_funcs:
                print(f'⚡ Uploading function: {name}')
                _request('PUT', f'/deploys/{did}/files/{s}',
                         binary=zipped,
                         ctype='application/zip', token=token)
        print('   ✓ Functions uploaded')

    # Poll until ready (Netlify processes async)
    print('⏳ Waiting for deploy to go live…', end='', flush=True)
    for _ in range(30):
        time.sleep(2)
        d = _request('GET', f'/deploys/{did}', token=token)
        state = d.get('state', '')
        print('.', end='', flush=True)
        if state in ('ready', 'error'):
            break
    print()

    site_url   = d.get('ssl_url') or d.get('url', '')
    deploy_url = d.get('deploy_ssl_url') or d.get('deploy_url', '')
    fn_count   = len(d.get('available_functions', []))
    print()
    print(f'✅ Deploy {d.get("state")}!')
    print(f'   Site:      {site_url}')
    print(f'   Deploy:    {deploy_url}')
    print(f'   Functions: {fn_count}')
    print(f'   App:       {site_url}/app/')
    print()

    import subprocess
    subprocess.run(['open', f'{site_url}/app/'], check=False)

if __name__ == '__main__':
    main()
