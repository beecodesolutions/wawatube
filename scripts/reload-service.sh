#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
pnpm db:migrate
pnpm build
systemctl --user restart wawatube
systemctl --user is-active wawatube
curl --fail --silent --show-error --retry 5 --retry-connrefused --retry-delay 1 http://localhost:3100/api/health
echo
