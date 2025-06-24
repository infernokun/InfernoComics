#!/bin/bash
#docker-entrypoint.sh
set -euo pipefail
IFS=$'\n\t'

MAIN=$(eval echo "$1")
shift

exec java -jar "${MAIN}" "$@"
