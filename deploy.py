#!/usr/bin/env python3
"""
Claude Power UI — Netlify Deploy Script
Uses Netlify Deploy API (no Node/npm required).

Usage:
    python3 deploy.py

On first run: prompts for your Netlify personal access token.
On subsequent runs: reuses the saved site ID from .netlify-site.
"""

import json, os, subprocess, sys, urllib.request, urllib.error
from pathlib import Path

ROOT   = Path(__file__).parent.resolve()
DIST   = '/tmp/claude-power-ui-deploy.zip'
TOKEN_FILE = ROOT / '.netlify-token'   # gitignored
SITE_FILE  = ROOT / '.netlify-site'    # gitignored

EXCLUDE = [
    '*.py', 'data/*', '.git/*', '__pycache__/*', '*.pyc',
    '.DS_Store', '*/.DS_Store', 'skills/*', '.netlifyignore',
    '.gitignore', '.netlify-token', '.netlify-site', 'deploy.py',
]

API = 'https://api.netlify.com/api/v1'

# ── Helpers ──────────────────────────────────────────────────────

def api(method, path, body=None, binary=None, token=None):
    url = f'{API}{path}'
    data = None
    headers = {'Authorization': f'Bearer {token}'}
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    elif binary is not None:
        data = binary
        headers['Content-Type'] = 'application/zip'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f'❌ Netlify API error {e.code}: {e.read().decode()}')
        sys.exit(1)

def build_zip():
    print('📦 Building deploy package…')
    excl = []
    for pat in EXCLUDE:
        excl += ['--exclude', pat]
    cmd = ['zip', '-r', DIST, '.'] + excl
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True)
    if r.returncode != 0:
        print('❌ zip failed:', r.stderr.decode())
        sys.exit(1)
    size_kb = Path(DIST).stat().st_size // 1024
    print(f'   → {DIST} ({size_kb} KB)')

# ── Main ─────────────────────────────────────────────────────────

def main():
    # 1. Get token
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text().strip()
    else:
        print('🔑 Netlify personal access token required.')
        print('   Get one at: https://app.netlify.com/user/applications/personal')
        token = input('   Paste token: ').strip()
        if not token:
            sys.exit('No token provided.')
        TOKEN_FILE.write_text(token)
        os.chmod(TOKEN_FILE, 0o600)

    # 2. Get or create site
    if SITE_FILE.exists():
        site_id = SITE_FILE.read_text().strip()
        print(f'🌐 Reusing site: {site_id}')
    else:
        print('🌐 Creating new Netlify site…')
        site = api('POST', '/sites', {'name': 'claude-power-ui'}, token=token)
        site_id = site['id']
        site_url = site.get('ssl_url') or site.get('url', '')
        SITE_FILE.write_text(site_id)
        print(f'   → Created: {site_url}')

    # 3. Build zip
    build_zip()

    # 4. Deploy
    print('🚀 Deploying to Netlify…')
    payload = Path(DIST).read_bytes()
    result  = api('POST', f'/sites/{site_id}/deploys', binary=payload, token=token)
    deploy_id  = result.get('id', '')
    deploy_url = result.get('deploy_ssl_url') or result.get('deploy_url', '')
    site_url   = result.get('ssl_url') or result.get('url', '')

    print()
    print('✅ Deploy complete!')
    print(f'   Site URL:   {site_url}')
    print(f'   Deploy URL: {deploy_url}')
    print(f'   Deploy ID:  {deploy_id}')
    print()
    print('   App:        ' + site_url + '/app/')
    print('   Admin:      ' + site_url + '/app/admin.html')
    print()

    # Open in browser
    subprocess.run(['open', site_url + '/app/'], check=False)

if __name__ == '__main__':
    main()
