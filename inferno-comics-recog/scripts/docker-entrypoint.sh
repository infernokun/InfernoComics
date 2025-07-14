#!/bin/bash
set -e

# Run any pre-startup commands here
echo "Starting Flask application..."

# Execute the main command
exec "$@"