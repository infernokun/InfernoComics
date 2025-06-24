#!/bin/bash

# Function to safely run commands and return empty string if they fail
safe_command() {
  output=$("$@" 2>/dev/null) || output=""
  echo "$output"
}

# Gather hostname, OS info, memory, CPU, disk, and uptime, then output JSON.
HOSTNAME=$(hostname 2>/dev/null || echo "")
OS_NAME=$(safe_command lsb_release -si)
if [ -z "$OS_NAME" ]; then
    OS_NAME=$(safe_command awk -F= '/^ID=/{gsub(/"/, "", $2); print $2}' /etc/os-release)
fi

# Get OS version
OS_VERSION=$(safe_command lsb_release -sr)
if [ -z "$OS_VERSION" ]; then
    OS_VERSION=$(safe_command awk -F= '/^VERSION_ID=/{gsub(/"/, "", $2); print $2}' /etc/os-release)
fi

# Memory: extract total and available memory (in GB with one decimal place)
TOTAL_RAM=$(awk '/MemTotal/ {printf "%.1f", $2 / 1024 / 1024}' /proc/meminfo 2>/dev/null || echo "0.0")
AVAILABLE_RAM=$(awk '/MemAvailable/ {printf "%.1f", $2 / 1024 / 1024}' /proc/meminfo 2>/dev/null || echo "0.0")
USED_RAM=$(awk -v total="$TOTAL_RAM" -v available="$AVAILABLE_RAM" 'BEGIN {printf "%.1f", (total != "" && available != "") ? total - available : 0.0}' 2>/dev/null || echo "0.0")

# CPU: get number of processors and CPU usage
CPU_COUNT=$(nproc 2>/dev/null || echo "0")
IDLE_BEFORE=$(awk '/cpu / {print $5}' /proc/stat 2>/dev/null || echo "0")
TOTAL_BEFORE=$(awk '/cpu / {sum=$2+$3+$4+$5+$6+$7+$8+$9+$10} END {print sum}' /proc/stat 2>/dev/null || echo "0")
sleep 1
IDLE_AFTER=$(awk '/cpu / {print $5}' /proc/stat 2>/dev/null || echo "0")
TOTAL_AFTER=$(awk '/cpu / {sum=$2+$3+$4+$5+$6+$7+$8+$9+$10} END {print sum}' /proc/stat 2>/dev/null || echo "0")
IDLE_DELTA=$((IDLE_AFTER - IDLE_BEFORE)) 2>/dev/null || IDLE_DELTA=0
TOTAL_DELTA=$((TOTAL_AFTER - TOTAL_BEFORE)) 2>/dev/null || TOTAL_DELTA=1  # Avoid division by zero
CPU_USAGE=$(awk -v idle="$IDLE_DELTA" -v total="$TOTAL_DELTA" 'BEGIN {printf "%.1f", (total > 0) ? (1 - idle / total) * 100 : 0.0}' 2>/dev/null || echo "0.0")

# Disk: determine if `df --output=size` is available or fallback to `df -m /`
if df --output=size / &>/dev/null; then
  TOTAL_DISK=$(df --output=size -m / 2>/dev/null | awk 'NR==2 {printf "%.1f", $1 / 1000}' 2>/dev/null)
  AVAILABLE_DISK=$(df --output=avail -m / 2>/dev/null | awk 'NR==2 {printf "%.1f", $1 / 1000}' 2>/dev/null)
else
  TOTAL_DISK=$(df -m / | awk 'NR==2 {printf "%.1f", $2 / 1000}' 2>/dev/null)
  AVAILABLE_DISK=$(df -m / | awk 'NR==2 {printf "%.1f", $4 / 1000}' 2>/dev/null)
fi

USED_DISK=$(awk -v total="$TOTAL_DISK" -v available="$AVAILABLE_DISK" 'BEGIN {printf "%.1f", total - available}' 2>/dev/null)

# Ensure valid values
TOTAL_DISK=${TOTAL_DISK:-"0.0"}
AVAILABLE_DISK=${AVAILABLE_DISK:-"0.0"}
USED_DISK=${USED_DISK:-"0.0"}

# Uptime in seconds
UPTIME=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo "0")

# Build JSON output
JSON=$(cat <<EOF
{
  "@class": "com.infernokun.amaterasu.models.entities.lab.RemoteServerStats",
  "hostname": "$HOSTNAME",
  "osName": "$OS_NAME",
  "osVersion": "$OS_VERSION",
  "totalRam": $TOTAL_RAM,
  "availableRam": $AVAILABLE_RAM,
  "usedRam": $USED_RAM,
  "cpu": $CPU_COUNT,
  "cpuUsagePercent": $CPU_USAGE,
  "totalDiskSpace": $TOTAL_DISK,
  "availableDiskSpace": $AVAILABLE_DISK,
  "usedDiskSpace": $USED_DISK,
  "uptime": $UPTIME
}
EOF
)

# Write the JSON result to an output file
OUTPUT_FILE="server_stats.json"
echo "$JSON" | tee $(dirname $0)/$OUTPUT_FILE
