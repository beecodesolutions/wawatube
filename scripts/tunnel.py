#!/usr/bin/env python3
"""Temporary password-protected Cloudflare tunnel. Ctrl+C stops everything."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def proxy_config(port, upstream, origin, public_url=''):
    # Exact origin translation preserves CSRF rejection for unrelated sites.
    mapping = f'"{public_url}" "{origin}";' if public_url else ''
    return f'''map_hash_bucket_size 128;
map $http_origin $wawatube_origin {{ default $http_origin; {mapping} }}
map $http_upgrade $wawatube_connection {{ default upgrade; '' close; }}
server {{
 listen 127.0.0.1:{port};
 auth_basic "Wawatube temporal";
 auth_basic_user_file /etc/nginx/wawatube.htpasswd;
 location / {{
  proxy_pass http://127.0.0.1:{upstream};
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header Origin $wawatube_origin;
  proxy_set_header Authorization "";
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $wawatube_connection;
  proxy_buffering off;
  proxy_read_timeout 300s;
 }}
}}
'''


def wait_http(url, headers=None):
    for _ in range(60):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=2):
                return
        except OSError:
            time.sleep(0.5)
    raise RuntimeError(f'Service did not become ready: {url}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--production', action='store_true', help='Serve built UI instead of Vite')
    args = parser.parse_args()
    for binary in ('docker', 'node', 'openssl'):
        if not shutil.which(binary):
            parser.error(f'{binary} is required')
    # Use the same installed dotenv parser as the app, never execute .env as shell.
    config = json.loads(subprocess.check_output([
        'node', '--input-type=module', '-e',
        'import dotenv from "dotenv"; import fs from "node:fs"; '
        'const e=dotenv.parse(fs.readFileSync("../../.env")); '
        'console.log(JSON.stringify({port:e.PORT || "3100", origin:e.PUBLIC_ORIGIN}));'
    ], cwd=ROOT / 'apps/api', text=True))
    api_port = int(config['port'])
    origin = config.get('origin', '').rstrip('/')
    if not 1 <= api_port <= 65535 or not re.fullmatch(r'https?://[a-zA-Z0-9.\[\]:-]+', origin):
        parser.error('Set valid PORT and PUBLIC_ORIGIN in .env first')
    wait_http(f'http://127.0.0.1:{api_port}/api/health')
    # Download before opening any tunnel; no credentials or project mounted in cloudflared.
    if subprocess.run(['docker', 'image', 'inspect', 'nginx:1.28-alpine'],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        run('docker', 'pull', 'nginx:1.28-alpine')
    run('docker', 'pull', 'cloudflare/cloudflared:latest')
    suffix = secrets.token_hex(4)
    proxy, tunnel = f'wawatube-proxy-{suffix}', f'wawatube-tunnel-{suffix}'
    containers = []
    vite = None
    proxy_port = free_port()
    ui_port = api_port if args.production else free_port()
    while ui_port == proxy_port:
        proxy_port = free_port()
    password = secrets.token_urlsafe(18)
    with tempfile.TemporaryDirectory(prefix='wawatube-tunnel-') as directory:
        folder = Path(directory)
        hashed = subprocess.check_output(['openssl', 'passwd', '-apr1', '-stdin'], input=password+'\n', text=True).strip()
        (folder / 'htpasswd').write_text('wawatube:'+hashed+'\n')
        (folder / 'htpasswd').chmod(0o644)  # NGINX worker reads bind mount; parent directory stays 0700.
        config_path = folder / 'nginx.conf'
        # Upstream remains loopback-only, protected by Basic Auth from first request.
        config_path.write_text(proxy_config(proxy_port, ui_port, origin))
        try:
            containers.append(proxy)
            run('docker', 'run', '-d', '--rm', '--name', proxy, '--network', 'host',
                '--entrypoint', 'nginx', '-v', f'{config_path}:/etc/nginx/conf.d/default.conf:ro',
                '-v', f'{folder}/htpasswd:/etc/nginx/wawatube.htpasswd:ro',
                'nginx:1.28-alpine', '-g', 'daemon off;')
            run('docker', 'exec', proxy, 'nginx', '-t')
            containers.append(tunnel)
            run('docker', 'run', '-d', '--rm', '--name', tunnel, '--network', 'host',
                'cloudflare/cloudflared:latest', 'tunnel', '--no-autoupdate',
                '--protocol', 'http2', '--url', f'http://127.0.0.1:{proxy_port}')
            public_url = None
            for _ in range(60):
                logs = subprocess.check_output(['docker', 'logs', tunnel], stderr=subprocess.STDOUT, text=True)
                match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', logs)
                if match:
                    public_url = match.group()
                    break
                time.sleep(1)
            if not public_url:
                raise RuntimeError('Cloudflare did not return a URL')
            if not args.production:
                options = json.dumps({'server': {'host': '127.0.0.1', 'port': ui_port,
                    'strictPort': True, 'allowedHosts': [public_url.removeprefix('https://')],
                    'hmr': {'protocol': 'wss', 'clientPort': 443},
                    'proxy': {'/api': f'http://127.0.0.1:{api_port}'}}})
                vite = subprocess.Popen(['node', '--input-type=module', '-e',
                    'import {createServer} from "vite"; '
                    f'const s=await createServer({options}); await s.listen();'], cwd=ROOT / 'apps/web', start_new_session=True)
                wait_http(f'http://127.0.0.1:{ui_port}/api/health')
            config_path.write_text(proxy_config(proxy_port, ui_port, origin, public_url))
            run('docker', 'exec', proxy, 'nginx', '-t')
            run('docker', 'exec', proxy, 'nginx', '-s', 'reload')
            auth = base64.b64encode(f'wawatube:{password}'.encode()).decode()
            wait_http(public_url+'/api/health', {'Authorization': 'Basic '+auth})
            print(f'\nURL: {public_url}\nUsuario: wawatube\nContraseña: {password}\nCtrl+C para apagar todo.', flush=True)
            while True:
                time.sleep(2)
                if vite and vite.poll() is not None:
                    raise RuntimeError('Vite stopped')
                for container in containers:
                    run('docker', 'inspect', container, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        finally:
            for container in reversed(containers):
                subprocess.run(['docker', 'stop', container], stdout=subprocess.DEVNULL)
            if vite and vite.poll() is None:
                os.killpg(vite.pid, signal.SIGTERM)
                try:
                    vite.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(vite.pid, signal.SIGKILL)
                    vite.wait()


def interrupt(*_):
    raise KeyboardInterrupt


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupt)
    try:
        main()
    except KeyboardInterrupt:
        print('\nTúnel apagado.')
