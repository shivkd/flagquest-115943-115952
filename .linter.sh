#!/bin/bash
cd /home/kavia/workspace/code-generation/flagquest-115943-115952/game_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

