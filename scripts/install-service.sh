#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
node_bin=${NODE_BIN:-$(command -v node || true)}
user_mode=false
[[ ${1:-} == --user ]] && user_mode=true
service_user=${SUDO_USER:-${USER:-}}
if ! $user_mode && [[ ${EUID} -ne 0 || -z "$service_user" || "$service_user" == root ]]; then
  echo 'Run with sudo from your normal account, or use --user for a user service.' >&2
  exit 1
fi
if $user_mode && [[ ${EUID} -eq 0 ]]; then
  echo 'Run --user without sudo.' >&2
  exit 1
fi
[[ -f "$root/.env" && -f "$root/apps/api/dist/server.js" && -f "$root/apps/web/dist/index.html" ]] || { echo 'Configure .env and run pnpm build first.' >&2; exit 1; }
[[ -x "$node_bin" ]] || { echo 'Node missing. Pass NODE_BIN=/absolute/path/to/node.' >&2; exit 1; }
[[ "$root" != *$'\n'* && "$root" != *'"'* && "$root" != *'%'* && "$node_bin" != *'"'* && "$node_bin" != *'%'* ]] || { echo 'Unsupported path characters.' >&2; exit 1; }
id "$service_user" >/dev/null
if ! $user_mode; then
  runuser -u "$service_user" -- test -r "$root/.env" || { echo "Service user $service_user cannot read $root/.env." >&2; exit 1; }
  runuser -u "$service_user" -- test -r "$root/apps/api/dist/server.js" || { echo "Service user $service_user cannot read the API build." >&2; exit 1; }
fi
if $user_mode; then
  unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  manager=(systemctl --user)
  target=default.target
else
  unit_dir=/etc/systemd/system
  manager=(systemctl)
  target=multi-user.target
fi
mkdir -p "$unit_dir"
unit_path="$unit_dir/wawatube.service"
unit_tmp=$(mktemp "$unit_path.XXXXXX")
trap 'rm -f -- "$unit_tmp"' EXIT
cat > "$unit_tmp" <<UNIT
[Unit]
Description=Wawatube family media library
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$root
ExecStart="$node_bin" "$root/apps/api/dist/server.js"
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
UMask=0077
StandardOutput=journal
StandardError=journal
UNIT
if ! $user_mode; then
  cat >> "$unit_tmp" <<UNIT
User=$service_user
PrivateTmp=true
ProtectSystem=full
UNIT
fi
cat >> "$unit_tmp" <<UNIT

[Install]
WantedBy=$target
UNIT
chmod 644 "$unit_tmp"
mv -f -- "$unit_tmp" "$unit_path"
trap - EXIT
"${manager[@]}" daemon-reload
"${manager[@]}" enable wawatube.service
"${manager[@]}" restart wawatube.service
if $user_mode; then
  echo 'Installed user service. Logs: journalctl --user -u wawatube -f'
  if [[ $(loginctl show-user "$USER" -p Linger --value) != yes ]]; then
    echo 'Boot without login requires an administrator to run: loginctl enable-linger <user>'
  fi
else
  echo 'Installed. Logs: journalctl -u wawatube -f'
fi
