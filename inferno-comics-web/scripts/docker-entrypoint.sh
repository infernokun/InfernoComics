#!/bin/sh
#docker-entrypoint.sh
LOCAL_CONFIG_FILE="/usr/share/nginx/html/assets/environment/app.config.json"
PRODUCTION_CONFIG_FILE="/usr/share/nginx/html/assets/environment/app.config.production.json"

# Ensure the production config file exists
if [ ! -f "$PRODUCTION_CONFIG_FILE" ]; then
  echo "ERROR: Production config file $PRODUCTION_CONFIG_FILE not found!"
  exit 1
fi

# Replace placeholders in production config with environment variables
envsubst < "$PRODUCTION_CONFIG_FILE" > "$LOCAL_CONFIG_FILE"

# Start Nginx
exec nginx -g "daemon off;"
