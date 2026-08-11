#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "NEON OVERDRIVE is running at http://localhost:8080"
echo "Press Ctrl+C to stop."
python3 -m http.server 8080
