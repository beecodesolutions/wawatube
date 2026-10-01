#!/usr/bin/env bash
set -euo pipefail
if [[ ${1:-} == --user ]]; then
  [[ ${EUID} -ne 0 ]] || { echo 'Run --user without sudo.' >&2; exit 1; }
  if systemctl --user cat wawatube.service >/dev/null 2>&1; then
    systemctl --user disable --now wawatube.service
  fi
  rm -f -- "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/wawatube.service"
  systemctl --user daemon-reload
else
  [[ ${EUID} -eq 0 ]] || { echo 'Run with sudo, or pass --user.' >&2; exit 1; }
  if systemctl cat wawatube.service >/dev/null 2>&1; then
    systemctl disable --now wawatube.service
  fi
  rm -f -- /etc/systemd/system/wawatube.service
  systemctl daemon-reload
fi
echo 'Service removed. Application, containers and media preserved.'
