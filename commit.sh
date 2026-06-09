#!/bin/bash
set -e
QUESTION_FILE="/mnt/g/seed/require/task0602/task30-collab-board/任务1/第2轮提问.txt"
PROJECT_DIR="/mnt/g/seed/require/task0602/task30-collab-board/collab-board"

SESSION_ID=$(awk '/^\[sessionID\]/{getline; while(/^$/){getline}; print; exit}' "$QUESTION_FILE")

if [ -z "$SESSION_ID" ]; then
  echo "ERROR: sessionID is empty"
  exit 1
fi

echo "SessionID: $SESSION_ID"
cd "$PROJECT_DIR"
git add .
git commit -m "$SESSION_ID"
echo "COMMIT_OK"
git rev-parse HEAD
