#!/bin/sh
# Runs Redis co-located on the same machine as the backend (bound to
# 127.0.0.1 only — never reachable outside this container, so no
# password/TLS needed) and the Node app in one container. Redis's data
# directory lives on the attached Fly volume so scheduled Bull jobs
# survive a deploy/restart instead of vanishing with the container.
set -e

mkdir -p /data/redis
chown -R nestjs:nodejs /data/redis

su-exec nestjs redis-server \
  --daemonize yes \
  --dir /data/redis \
  --appendonly yes \
  --bind 127.0.0.1 \
  --port 6379

until su-exec nestjs redis-cli -h 127.0.0.1 ping 2>/dev/null | grep -q PONG; do
  sleep 0.2
done

exec su-exec nestjs node dist/main.js
