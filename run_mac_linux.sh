#!/usr/bin/env sh
# Starts OrbitalUV on this computer.
cd "$(dirname "$0")"
python3 app.py "$@"
