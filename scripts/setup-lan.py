#!/usr/bin/env python3
"""Configure LAN HTTP access on Debian/Ubuntu with a system Wawatube service."""
import argparse
import configparser
import io
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def run(*args):
    subprocess.run(args, check=True)


def env_config(text, name, port):
    # Never source .env: values can contain shell syntax and secrets.
    values = {"HOST": "127.0.0.1", "PORT": str(port),
              "PUBLIC_ORIGIN": f"http://{name}.local"}
    for key, value in values.items():
        text = re.sub(rf"^[ \t]*(?:export[ \t]+)?{key}[ \t]*=.*\n?", "", text, flags=re.M)
        text = text.rstrip("\n") + f"\n{key}={value}\n"
    return text


def avahi_config(text, name, interface):
    config = configparser.ConfigParser(interpolation=None, strict=True)
    config.read_string(text)
    if not config.has_section("server"):
        config.add_section("server")
    config["server"]["host-name"] = name
    config["server"]["domain-name"] = "local"
    config["server"]["allow-interfaces"] = interface
    config.remove_option("server", "deny-interfaces")
    output = io.StringIO()
    config.write(output, space_around_delimiters=False)
    return output.getvalue()


def nginx_config(name, port):
    return f"""# Managed by Wawatube scripts/setup-lan.py
server {{
    listen 80;
    listen [::]:80;
    server_name {name}.local;
    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }}
}}
"""


def apply(files, backup, name):
    originals = {}
    for index, path in enumerate(files):
        if path.is_symlink():
            raise ValueError(f"Refusing to overwrite symlink: {path}")
        originals[path] = path.exists()
        if path.exists():
            shutil.copy2(path, backup / str(index))
    (backup / "paths.txt").write_text("\n".join(str(p) for p in files) + "\n")
    try:
        for path, content in files.items():
            path.write_text(content)
        run("nginx", "-t")
        run("systemctl", "restart", "wawatube.service", "avahi-daemon.service")
        run("systemctl", "enable", "--now", "nginx.service", "avahi-daemon.service")
        run("systemctl", "reload", "nginx.service")
        # Verify actual virtual host, without depending on this machine's mDNS resolver.
        request = urllib.request.Request("http://127.0.0.1/api/health",
                                         headers={"Host": f"{name}.local"})
        for attempt in range(20):
            try:
                with urllib.request.urlopen(request, timeout=2) as response:
                    if response.status == 200 and b'"ok"' in response.read():
                        return
            except OSError:
                pass
            time.sleep(1)
        raise RuntimeError("Wawatube health check failed through NGINX")
    except BaseException:
        for index, path in enumerate(files):
            if originals[path]:
                shutil.copy2(backup / str(index), path)
            else:
                path.unlink(missing_ok=True)
        # Best effort to restore running services; retain original error and backups.
        subprocess.run(["systemctl", "restart", "wawatube", "avahi-daemon"])
        subprocess.run(["systemctl", "reload", "nginx"])
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interface", required=True, help="LAN interface from ip -br addr")
    parser.add_argument("--name", default="wawatube", help="mDNS name without .local")
    parser.add_argument("--port", type=int, default=3100, help="Internal Wawatube port")
    parser.add_argument("--dry-run", action="store_true", help="Preview without installing or writing")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", args.name):
        parser.error("Invalid hostname; use lowercase letters, digits and internal hyphens")
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,15}", args.interface) or not Path(
            "/sys/class/net", args.interface).exists() or args.interface == "lo":
        parser.error("Choose an existing LAN interface, not lo")
    if not 1024 <= args.port <= 65535:
        parser.error("Internal port must be between 1024 and 65535")
    if args.dry_run:
        print(nginx_config(args.name, args.port))
        print(f"Avahi: host-name={args.name}, allow-interfaces={args.interface}")
        print(f".env: HOST=127.0.0.1 PORT={args.port} PUBLIC_ORIGIN=http://{args.name}.local")
        return
    if os.geteuid() != 0:
        parser.error("Run with sudo, or use --dry-run")
    if not shutil.which("apt-get") or not Path("/run/systemd/system").exists():
        parser.error("Requires Debian/Ubuntu with systemd")
    env_path = ROOT / ".env"
    if not env_path.is_file():
        parser.error("Configure .env and install Wawatube first")
    run("systemctl", "is-active", "--quiet", "wawatube.service")
    service_root = subprocess.check_output(
        ["systemctl", "show", "wawatube.service", "--property=WorkingDirectory", "--value"],
        text=True).strip()
    if Path(service_root).resolve() != ROOT:
        parser.error("Run the script from the checkout used by wawatube.service")
    run("apt-get", "update")
    run("apt-get", "install", "-y", "nginx", "avahi-daemon")
    avahi_path = Path("/etc/avahi/avahi-daemon.conf")
    nginx_path = Path("/etc/nginx/conf.d/wawatube.conf")
    if nginx_path.exists() and not nginx_path.read_text().startswith("# Managed by Wawatube"):
        parser.error(f"Existing unmanaged file: {nginx_path}")
    files = {env_path: env_config(env_path.read_text(), args.name, args.port),
             avahi_path: avahi_config(avahi_path.read_text(), args.name, args.interface),
             nginx_path: nginx_config(args.name, args.port)}
    backup = Path(tempfile.mkdtemp(prefix="wawatube-lan-", dir="/var/backups"))
    print(f"Private configuration backups: {backup}", flush=True)
    apply(files, backup, args.name)
    print(f"Ready: http://{args.name}.local (verify from another LAN device)")


if __name__ == "__main__":
    main()
