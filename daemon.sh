#!/bin/bash
cd /home/z/my-project

# Start auto-git-sync daemon if not already running
if ! pgrep -f "auto-git-sync" > /dev/null 2>&1; then
  echo "[$(date)] Starting auto-git-sync daemon..." >> /home/z/my-project/daemon.log
  bash /home/z/my-project/auto-git-sync.sh >> /home/z/my-project/git-sync.log 2>&1 &
fi

# Start Next.js dev server
while true; do
  echo "[$(date)] Starting server..." >> /home/z/my-project/daemon.log
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 2s..." >> /home/z/my-project/daemon.log
  sleep 2
done
