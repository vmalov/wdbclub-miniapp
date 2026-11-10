#!/usr/bin/env bash
# Выкатка WDB Club на ВМ (#8, docs/server.md): релиз в /opt/wdbclub/releases/<sha>, атомарный симлинк current,
# рестарт API. Откат: tools/deploy.sh --rollback (симлинк на предыдущий релиз).
# Нужно: ssh-алиас wdbclub (~/.ssh/config), чистое дерево на коммите, который выкатываем.
set -euo pipefail
HOST=${WDB_HOST:-wdbclub}
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--rollback" ]]; then
  ssh "$HOST" 'set -euo pipefail; cd /opt/wdbclub; cur=$(basename "$(readlink current)"); prev=$(ls -1t releases | { grep -vx "$cur" || true; } | head -1); [ -n "$prev" ] || { echo "некуда откатываться"; exit 1; }; sudo ln -sfn "releases/$prev" current.tmp && sudo mv -Tf current.tmp current && sudo systemctl restart wdbclub && echo "откат на $prev"'
  exit 0
fi

[[ -z "$(git status --porcelain)" ]] || { echo "есть незакоммиченные изменения — выкатываем только коммит"; exit 1; }
SHA=$(git rev-parse --short HEAD)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/public"
cp -R index.html app ds "$TMP/public/"
cp -R server deploy "$TMP/"
printf '{"sha":"%s","builtAt":"%s"}\n' "$SHA" "$(date -u +%FT%TZ)" > "$TMP/public/version.json"

ssh "$HOST" "sudo mkdir -p /opt/wdbclub/releases/$SHA && sudo chown deploy /opt/wdbclub/releases/$SHA"
rsync -az --delete "$TMP/" "$HOST:/opt/wdbclub/releases/$SHA/"
ssh "$HOST" bash -s -- "$SHA" <<'REMOTE'
set -euo pipefail
SHA=$1
cd /opt/wdbclub
sudo chown -R root:root "releases/$SHA" && sudo chmod -R u=rwX,go=rX "releases/$SHA"
sudo install -m 644 "releases/$SHA/deploy/wdbclub.service" "releases/$SHA/deploy/wdbclub-backup.service" "releases/$SHA/deploy/wdbclub-backup.timer" /etc/systemd/system/
sudo install -m 644 "releases/$SHA/deploy/Caddyfile" /etc/caddy/Caddyfile
sudo ln -sfn "releases/$SHA" current.tmp && sudo mv -Tf current.tmp current
sudo systemctl daemon-reload
sudo systemctl enable --now wdbclub-backup.timer >/dev/null
sudo systemctl enable wdbclub >/dev/null && sudo systemctl restart wdbclub
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { echo "Caddyfile не прошёл проверку"; exit 1; }
sudo systemctl reload caddy
live=$(basename "$(readlink current)")
ls -1t releases | { grep -vx "$live" || true; } | tail -n +5 | xargs -r -I{} sudo rm -rf "releases/{}"
sleep 1; systemctl is-active wdbclub
REMOTE
echo "выкачено: $SHA"
