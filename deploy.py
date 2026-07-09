#!/usr/bin/env python3
"""
Claude Power UI — Netlify Deploy Script
Uses the Netlify CLI (bundled Node.js) for reliable deploys of
both static files AND serverless functions in one command.

Usage:
    python3 deploy.py

Requirements: internet connection (Node.js downloaded on first run).
"""

import os, subprocess, sys, urllib.request, ssl
from pathlib import Path

# Disable SSL verification for Node.js download on macOS
ssl._create_default_https_context = ssl._create_unverified_context

ROOT       = Path(__file__).parent.resolve()
TOKEN_FILE = ROOT / '.netlify-token'
SITE_FILE  = ROOT / '.netlify-site'

NODE_VERSION = '20.18.0'
NODE_DIR     = Path(f'/tmp/node-v{NODE_VERSION}-darwin-x64')
NODE_BIN     = NODE_DIR / 'bin'
NETLIFY_BIN  = Path('/tmp/netlify-cli/bin/netlify')

def ensure_node():
    if (NODE_BIN / 'node').exists():
        return
    import tarfile
    print(f'⬇  Downloading Node.js {NODE_VERSION}…')
    url = f'https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-darwin-x64.tar.gz'
    archive = '/tmp/node.tar.gz'
    urllib.request.urlretrieve(url, archive)
    print('   Extracting…')
    with tarfile.open(archive) as tf:
        tf.extractall('/tmp/')
    print(f'   ✓ Node.js ready')

def ensure_netlify_cli():
    if NETLIFY_BIN.exists():
        return
    print('⬇  Installing netlify-cli…')
    env = {**os.environ, 'PATH': f'{NODE_BIN}:{os.environ.get("PATH","")}'}
    subprocess.run(
        [str(NODE_BIN / 'npm'), 'install', '-g', 'netlify-cli', '--prefix', '/tmp/netlify-cli'],
        env=env, check=True, capture_output=True,
    )
    print('   ✓ netlify-cli ready')

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

    if not SITE_FILE.exists():
        sys.exit('No .netlify-site file found. Run the initial setup first.')

    site_id = SITE_FILE.read_text().strip()

    ensure_node()
    ensure_netlify_cli()

    env = {
        **os.environ,
        'PATH':                f'{NODE_BIN}:{NETLIFY_BIN.parent}:{os.environ.get("PATH","")}',
        'NETLIFY_AUTH_TOKEN':  token,
        'NETLIFY_SITE_ID':     site_id,
    }

    print('🚀 Deploying to Netlify…')
    result = subprocess.run(
        [str(NETLIFY_BIN), 'deploy', '--prod',
         '--dir', '.',
         '--functions', 'netlify/functions',
         '--message', 'Deployed via deploy.py'],
        cwd=ROOT,
        env=env,
    )

    if result.returncode != 0:
        sys.exit(f'Deploy failed (exit {result.returncode})')

if __name__ == '__main__':
    main()
