#!/bin/sh
# Har kuni PostgreSQL zaxira nusxasi; 14 kundan eskilari öçiriladi.
# Cron: 30 2 * * * /opt/prosupply/deploy/backup.sh
set -e
cd "$(dirname "$0")/.."
mkdir -p backups
. ./.env
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-prosupply}" "${POSTGRES_DB:-prosupply}" | gzip > "backups/prosupply_$(date +%F).sql.gz"
find backups -name 'prosupply_*.sql.gz' -mtime +14 -delete
