#!/bin/bash

# MySQL to PostgreSQL Converter Script
# Usage: ./mysql_to_postgres.sh input_file.sql [output_file] [--keep-containers]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MYSQL_CONTAINER_NAME="mysql-converter-$(date +%s)"
POSTGRES_CONTAINER_NAME="postgres-converter-$(date +%s)"
MYSQL_PASSWORD="converter123"
POSTGRES_PASSWORD="converter123"
MYSQL_DATABASE="source_db"
POSTGRES_DATABASE="target_db"
NETWORK_NAME="converter-network-$(date +%s)"

# Default values
KEEP_CONTAINERS=false
VERBOSE=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to cleanup containers and network
cleanup() {
    if [ "$KEEP_CONTAINERS" = false ]; then
        print_status "Cleaning up containers and network..."
        docker stop $MYSQL_CONTAINER_NAME $POSTGRES_CONTAINER_NAME 2>/dev/null || true
        docker rm $MYSQL_CONTAINER_NAME $POSTGRES_CONTAINER_NAME 2>/dev/null || true
        docker network rm $NETWORK_NAME 2>/dev/null || true
        print_success "Cleanup completed"
    else
        print_warning "Containers kept running as requested:"
        echo "  MySQL: $MYSQL_CONTAINER_NAME"
        echo "  PostgreSQL: $POSTGRES_CONTAINER_NAME"
        echo "  Network: $NETWORK_NAME"
    fi
}

# Function to show help
show_help() {
    echo "MySQL to PostgreSQL Converter"
    echo ""
    echo "Usage: $0 <input_file.sql> [output_file] [options]"
    echo ""
    echo "Arguments:"
    echo "  input_file.sql    MySQL dump file to convert"
    echo "  output_file       Output file name (default: input_file_postgres.sql.gz)"
    echo ""
    echo "Options:"
    echo "  --keep-containers Keep Docker containers running after conversion"
    echo "  --verbose         Show detailed output"
    echo "  --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 mydatabase.sql"
    echo "  $0 mydatabase.sql converted_db.sql.gz"
    echo "  $0 mydatabase.sql --keep-containers"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is required but not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if pgloader Docker image is available
    print_status "Checking pgloader Docker image..."
    if ! docker image inspect dimitri/pgloader &>/dev/null; then
        print_status "Pulling pgloader Docker image..."
        docker pull dimitri/pgloader
    fi
    
    print_success "Prerequisites check completed"
}

# Function to validate input file
validate_input() {
    if [ ! -f "$INPUT_FILE" ]; then
        print_error "Input file '$INPUT_FILE' does not exist"
        exit 1
    fi
    
    if [ ! -r "$INPUT_FILE" ]; then
        print_error "Input file '$INPUT_FILE' is not readable"
        exit 1
    fi
    
    # Check if file looks like a MySQL dump
    if ! head -20 "$INPUT_FILE" | grep -qi "mysql\|dump\|create table\|insert into"; then
        print_warning "File doesn't appear to be a MySQL dump. Proceeding anyway..."
    fi
    
    FILE_SIZE=$(du -h "$INPUT_FILE" | cut -f1)
    print_status "Input file size: $FILE_SIZE"
}

# Function to start MySQL container
start_mysql() {
    print_status "Starting MySQL container..."
    
    docker run -d \
        --name $MYSQL_CONTAINER_NAME \
        --network $NETWORK_NAME \
        -e MYSQL_ROOT_PASSWORD=$MYSQL_PASSWORD \
        -e MYSQL_DATABASE=$MYSQL_DATABASE \
        mysql:5.7 \
        --default-authentication-plugin=mysql_native_password \
        --max_allowed_packet=1073741824 \
        --innodb_buffer_pool_size=1073741824
    
    # Wait for MySQL to be ready
    print_status "Waiting for MySQL to be ready..."
    for i in {1..60}; do
        if docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD -e "SELECT 1" &>/dev/null; then
            break
        fi
        if [ $i -eq 60 ]; then
            print_error "MySQL failed to start within 60 seconds"
            cleanup
            exit 1
        fi
        sleep 1
    done
    
    print_success "MySQL container started"
}

# Function to start PostgreSQL container
start_postgres() {
    print_status "Starting PostgreSQL container..."
    
    docker run -d \
        --name $POSTGRES_CONTAINER_NAME \
        --network $NETWORK_NAME \
        -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
        -e POSTGRES_DB=$POSTGRES_DATABASE \
        postgres:17 \
        -c shared_buffers=256MB \
        -c maintenance_work_mem=256MB \
        -c checkpoint_completion_target=0.9 \
        -c wal_buffers=16MB
    
    # Wait for PostgreSQL to be ready
    print_status "Waiting for PostgreSQL to be ready..."
    for i in {1..60}; do
        if docker exec $POSTGRES_CONTAINER_NAME pg_isready -U postgres &>/dev/null; then
            break
        fi
        if [ $i -eq 60 ]; then
            print_error "PostgreSQL failed to start within 60 seconds"
            cleanup
            exit 1
        fi
        sleep 1
    done
    
    print_success "PostgreSQL container started"
}

# Function to import MySQL dump
import_mysql_dump() {
    print_status "Importing MySQL dump file..."
    
    # Copy file to container
    docker cp "$INPUT_FILE" $MYSQL_CONTAINER_NAME:/tmp/import.sql
    
    # Import with optimized settings
    docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD -e "
        SET GLOBAL foreign_key_checks = 0;
        SET GLOBAL unique_checks = 0;
        SET GLOBAL autocommit = 0;
        SET GLOBAL innodb_flush_log_at_trx_commit = 0;
        SET GLOBAL sync_binlog = 0;
    "
    
    # Import the dump
    if [ "$VERBOSE" = true ]; then
        docker exec -i $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD $MYSQL_DATABASE < "$INPUT_FILE"
    else
        docker exec -i $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD $MYSQL_DATABASE < "$INPUT_FILE" &>/dev/null
    fi
    
    # Restore settings
    docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD -e "
        SET GLOBAL foreign_key_checks = 1;
        SET GLOBAL unique_checks = 1;
        SET GLOBAL autocommit = 1;
    "
    
    print_success "MySQL dump imported successfully"
}

# Function to run pgloader migration using Docker with memory management
run_pgloader() {
    print_status "Running pgloader migration using Docker..."
    
    # Get container IP addresses within the network
    MYSQL_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $MYSQL_CONTAINER_NAME)
    POSTGRES_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $POSTGRES_CONTAINER_NAME)
    
    # Build connection URLs
    MYSQL_URL="mysql://root:$MYSQL_PASSWORD@$MYSQL_IP/$MYSQL_DATABASE"
    POSTGRES_URL="postgresql://postgres:$POSTGRES_PASSWORD@$POSTGRES_IP/$POSTGRES_DATABASE"
    
    print_status "MySQL URL: mysql://root:***@$MYSQL_IP/$MYSQL_DATABASE"
    print_status "PostgreSQL URL: postgresql://postgres:***@$POSTGRES_IP/$POSTGRES_DATABASE"
    
    # Create optimized pgloader configuration
    PGLOADER_CONFIG="/tmp/pgloader_config_$(date +%s).load"
    cat > "$PGLOADER_CONFIG" << EOF
LOAD DATABASE
    FROM $MYSQL_URL
    INTO $POSTGRES_URL

WITH include drop, create tables, create indexes, reset sequences,
     workers = 2, concurrency = 1,
     max parallel create index = 1,
     batch rows = 25000,
     batch size = 20MB

SET work_mem to '128MB', 
    maintenance_work_mem to '256MB'

BEFORE LOAD DO
\$\$ DROP SCHEMA IF EXISTS public CASCADE; \$\$,
\$\$ CREATE SCHEMA public; \$\$;
EOF

    # Run pgloader with increased memory limits and better error handling
    if [ "$VERBOSE" = true ]; then
        docker run --rm \
            --network $NETWORK_NAME \
            --memory=6g \
            --memory-swap=12g \
            --shm-size=1g \
            -v "$PGLOADER_CONFIG:/config.load" \
            dimitri/pgloader pgloader --verbose /config.load
    else
        docker run --rm \
            --network $NETWORK_NAME \
            --memory=6g \
            --memory-swap=12g \
            --shm-size=1g \
            -v "$PGLOADER_CONFIG:/config.load" \
            dimitri/pgloader pgloader /config.load
    fi
    
    # Clean up config file
    rm -f "$PGLOADER_CONFIG"
    
    print_success "Data migration completed using Docker pgloader"
}

# Function to export PostgreSQL dump
export_postgres_dump() {
    print_status "Exporting PostgreSQL dump..."
    
    # Create a temporary container to run pg_dump with the correct version
    TEMP_DUMP_CONTAINER="pg-dump-$(date +%s)"
    
    # Use PostgreSQL 17 client to dump the database
    docker run --rm \
        --name $TEMP_DUMP_CONTAINER \
        --network $NETWORK_NAME \
        -e PGPASSWORD=$POSTGRES_PASSWORD \
        postgres:17 \
        pg_dump -h $POSTGRES_CONTAINER_NAME -U postgres -d $POSTGRES_DATABASE \
        --no-owner --no-privileges --verbose 2>/dev/null | gzip > "$OUTPUT_FILE"
    
    if [ ! -f "$OUTPUT_FILE" ] || [ ! -s "$OUTPUT_FILE" ]; then
        print_error "Failed to create output file or file is empty"
        exit 1
    fi
    
    OUTPUT_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    print_success "PostgreSQL dump exported: $OUTPUT_FILE ($OUTPUT_SIZE)"
}

# Function to show summary
show_summary() {
    echo ""
    echo "========================================="
    echo "           CONVERSION SUMMARY"
    echo "========================================="
    echo "Input file:      $INPUT_FILE"
    echo "Output file:     $OUTPUT_FILE"
    echo "Input size:      $(du -h "$INPUT_FILE" | cut -f1)"
    echo "Output size:     $(du -h "$OUTPUT_FILE" | cut -f1)"
    echo "Containers used:"
    echo "  MySQL:         $MYSQL_CONTAINER_NAME"
    echo "  PostgreSQL:    $POSTGRES_CONTAINER_NAME"
    echo "========================================="
}

# Main function
main() {
    # Parse arguments
    if [ $# -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        show_help
        exit 0
    fi
    
    INPUT_FILE="$1"
    
    # Parse remaining arguments
    shift
    while [ $# -gt 0 ]; do
        case $1 in
            --keep-containers)
                KEEP_CONTAINERS=true
                ;;
            --verbose)
                VERBOSE=true
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                if [ -z "$OUTPUT_FILE" ]; then
                    OUTPUT_FILE="$1"
                else
                    print_error "Unknown option: $1"
                    show_help
                    exit 1
                fi
                ;;
        esac
        shift
    done
    
    # Set default output file if not provided
    if [ -z "$OUTPUT_FILE" ]; then
        BASE_NAME=$(basename "$INPUT_FILE" .sql)
        OUTPUT_FILE="${BASE_NAME}_postgres.sql.gz"
    fi
    
    # Trap to ensure cleanup on exit
    trap cleanup EXIT INT TERM
    
    print_status "Starting MySQL to PostgreSQL conversion..."
    print_status "Input: $INPUT_FILE"
    print_status "Output: $OUTPUT_FILE"
    
    # Run conversion steps
    check_prerequisites
    validate_input
    
    # Create Docker network
    print_status "Creating Docker network..."
    docker network create $NETWORK_NAME
    
    start_mysql
    start_postgres
    import_mysql_dump
    run_pgloader
    export_postgres_dump
    
    show_summary
    print_success "Conversion completed successfully!"
}

# Run main function
main "$@"