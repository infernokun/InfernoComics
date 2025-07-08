#!/bin/bash

# MySQL to PostgreSQL Converter Script
# Usage: ./mysql_to_postgres.sh input_file.sql [output_prefix] [--keep-containers]

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
SPECIFIC_TABLES=""

# Default values
KEEP_CONTAINERS=false
VERBOSE=false
OUTPUT_PREFIX=""

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
    echo "Usage: $0 <input_file.sql> [output_prefix] [options]"
    echo ""
    echo "Arguments:"
    echo "  input_file.sql    MySQL dump file to convert"
    echo "  output_prefix     Output file prefix (default: input_filename)"
    echo ""
    echo "Output files created:"
    echo "  {prefix}_mysql_filtered.sql     - Filtered MySQL dump"
    echo "  {prefix}_postgres.sql.gz        - Converted PostgreSQL dump"
    echo ""
    echo "Options:"
    echo "  --keep-containers Keep Docker containers running after conversion"
    echo "  --verbose         Show detailed output"
    echo "  --tables          Comma-separated list of specific tables to migrate"
    echo "  --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 mydatabase.sql"
    echo "  $0 mydatabase.sql converted_db"
    echo "  $0 mydatabase.sql filtered --tables gcd_series,gcd_issue"
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

# Function to import MySQL dump with better error handling and debugging
import_mysql_dump() {
    print_status "Importing MySQL dump file..."
    
    # Check the size of the file we're importing
    IMPORT_SIZE=$(du -h "$FILTERED_MYSQL_FILE" | cut -f1)
    print_status "Importing file: $FILTERED_MYSQL_FILE ($IMPORT_SIZE)"
    
    # Import with optimized settings
    docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD -e "
        SET GLOBAL foreign_key_checks = 0;
        SET GLOBAL unique_checks = 0;
        SET GLOBAL autocommit = 0;
        SET GLOBAL innodb_flush_log_at_trx_commit = 0;
        SET GLOBAL sync_binlog = 0;
        SET GLOBAL max_allowed_packet = 1073741824;
        SET GLOBAL innodb_buffer_pool_size = 1073741824;
    " 2>/dev/null
    
    # Test if we can connect and the database exists
    docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD $MYSQL_DATABASE -e "SELECT 'MySQL connection test successful';" 2>/dev/null
    
    print_status "Starting MySQL import (this may take a while for large files)..."
    
    # Import the dump with better error handling
    if [ "$VERBOSE" = true ]; then
        # Show progress and errors in verbose mode
        pv "$FILTERED_MYSQL_FILE" 2>/dev/null || cat "$FILTERED_MYSQL_FILE" | \
        docker exec -i $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD $MYSQL_DATABASE -v
        IMPORT_RESULT=$?
    else
        # Import with error capture
        cat "$FILTERED_MYSQL_FILE" | \
        docker exec -i $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD $MYSQL_DATABASE 2>&1 | \
        grep -E "(ERROR|Warning)" | head -10
        IMPORT_RESULT=${PIPESTATUS[1]}
    fi
    
    # Check if import was successful
    if [ $IMPORT_RESULT -ne 0 ]; then
        print_error "MySQL import failed with exit code: $IMPORT_RESULT"
        
        # Try to get more information about the failure
        print_status "Checking MySQL error log..."
        docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD -e "SHOW WARNINGS LIMIT 5;" 2>/dev/null || true
        
        # Try importing just the first part to isolate the problem
        print_status "Testing import of first 1000 lines..."
        head -1000 "$FILTERED_MYSQL_FILE" | docker exec -i $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD $MYSQL_DATABASE 2>&1 | head -5
        
        print_error "MySQL import failed. Check the filtered SQL file for syntax errors."
        exit 1
    fi
    
    # Restore settings and commit
    docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD -e "
        COMMIT;
        SET GLOBAL foreign_key_checks = 1;
        SET GLOBAL unique_checks = 1;
        SET GLOBAL autocommit = 1;
    " 2>/dev/null
    
    # Verify the import worked
    if [ ! -z "$SPECIFIC_TABLES" ]; then
        IFS=',' read -ra TABLE_ARRAY <<< "$SPECIFIC_TABLES"
        for table in "${TABLE_ARRAY[@]}"; do
            TABLE_COUNT=$(docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD $MYSQL_DATABASE -se "SELECT COUNT(*) FROM \`$table\`;" 2>/dev/null || echo "0")
            print_status "Table $table: $TABLE_COUNT rows imported"
            
            if [ "$TABLE_COUNT" = "0" ]; then
                print_warning "Table $table has 0 rows. Checking if table exists..."
                docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD $MYSQL_DATABASE -e "SHOW TABLES LIKE '$table';" 2>/dev/null || true
                
                print_status "Checking filtered SQL file for $table data..."
                INSERT_COUNT=$(grep -c "INSERT INTO \`$table\`" "$FILTERED_MYSQL_FILE" 2>/dev/null || echo "0")
                print_status "Found $INSERT_COUNT INSERT statements for $table in filtered file"
                
                if [ "$INSERT_COUNT" -gt 0 ]; then
                    print_status "Sample INSERT statement for debugging:"
                    grep "INSERT INTO \`$table\`" "$FILTERED_MYSQL_FILE" | head -1 | cut -c1-200
                fi
            fi
        done
    fi
    
    print_success "MySQL dump import process completed"
}

# Enhanced function to extract CREATE TABLE with precise comma handling
extract_table_definition_precise() {
    local table="$1"
    local input_file="$2"
    local output_file="$3"
    
    print_status "  Extracting CREATE TABLE for $table..."
    
    # Create temporary file for this table
    local temp_table_file="/tmp/table_${table}_$$.sql"
    
    # Find the exact line numbers for the table definition
    local start_line=$(grep -n "^CREATE TABLE.*\`$table\`" "$input_file" | cut -d: -f1)
    if [ -z "$start_line" ]; then
        print_warning "  Could not find CREATE TABLE for $table"
        return 1
    fi
    
    # Find the end line (look for ) ENGINE= after the start)
    local end_line=$(tail -n +$start_line "$input_file" | grep -n "^) ENGINE=" | head -1 | cut -d: -f1)
    if [ -z "$end_line" ]; then
        print_warning "  Could not find end of CREATE TABLE for $table"
        return 1
    fi
    
    # Calculate actual end line number
    end_line=$((start_line + end_line - 1))
    
    print_status "  Extracting lines $start_line to $end_line for table $table"
    
    # Extract the table definition
    sed -n "${start_line},${end_line}p" "$input_file" > "$temp_table_file"
    
    # More precise foreign key removal - only remove entire CONSTRAINT lines
    # First, let's see what we're dealing with
    if [ "$VERBOSE" = true ]; then
        print_status "  Original table definition (last 10 lines):"
        tail -10 "$temp_table_file" | sed 's/^/    /'
    fi
    
    # Create a cleaned version
    local cleaned_file="/tmp/cleaned_${table}_$$.sql"
    
    # Process line by line to preserve structure
    while IFS= read -r line; do
        # Skip lines that are foreign key constraints referencing other gcd tables
        if echo "$line" | grep -q "CONSTRAINT.*FOREIGN KEY.*REFERENCES.*\`gcd_"; then
            print_status "  Removing foreign key constraint: $(echo "$line" | sed 's/^[[:space:]]*//' | cut -c1-50)..."
            continue
        fi
        
        # Write the line to cleaned file
        echo "$line" >> "$cleaned_file"
        
    done < "$temp_table_file"
    
    # Now fix any trailing commas that might be left
    # Look for lines that have only a comma and whitespace before the closing )
    sed -i '/^[[:space:]]*,[[:space:]]*$/d' "$cleaned_file"
    
    # Fix cases where the last column/key definition has a trailing comma before )
    # Use awk for more precise control
    awk '
    BEGIN { prev_line = "" }
    {
        if (NR > 1) {
            # If current line is ") ENGINE=" and previous line ends with comma, remove comma
            if ($0 ~ /^[[:space:]]*\)[[:space:]]*ENGINE=/ && prev_line ~ /,[[:space:]]*$/) {
                gsub(/,[[:space:]]*$/, "", prev_line)
            }
            print prev_line
        }
        prev_line = $0
    }
    END { print prev_line }
    ' "$cleaned_file" > "$temp_table_file"
    
    # Verify the result
    if [ "$VERBOSE" = true ]; then
        print_status "  Cleaned table definition (last 10 lines):"
        tail -10 "$temp_table_file" | sed 's/^/    /'
    fi
    
    # Basic syntax check
    if ! grep -q "^) ENGINE=" "$temp_table_file"; then
        print_error "  Table definition appears incomplete - missing ENGINE clause"
        cat "$temp_table_file" | tail -5
        return 1
    fi
    
    # Add the cleaned table definition to output
    cat "$temp_table_file" >> "$output_file"
    echo "" >> "$output_file"
    
    # Cleanup
    rm -f "$temp_table_file" "$cleaned_file"
    return 0
}

# Alternative simpler approach - extract without modifying foreign keys
extract_table_definition() {
    local table="$1"
    local input_file="$2"
    local output_file="$3"
    
    print_status "  Extracting CREATE TABLE for $table (simple method)..."
    
    # Just extract the table as-is, without removing foreign keys
    # pgloader can handle foreign key constraints to missing tables
    
    local start_line=$(grep -n "^CREATE TABLE.*\`$table\`" "$input_file" | cut -d: -f1)
    if [ -z "$start_line" ]; then
        print_warning "  Could not find CREATE TABLE for $table"
        return 1
    fi
    
    local end_line=$(tail -n +$start_line "$input_file" | grep -n "^) ENGINE=" | head -1 | cut -d: -f1)
    if [ -z "$end_line" ]; then
        print_warning "  Could not find end of CREATE TABLE for $table"
        return 1
    fi
    
    end_line=$((start_line + end_line - 1))
    
    print_status "  Extracting lines $start_line to $end_line for table $table"
    
    # Extract without any modifications
    sed -n "${start_line},${end_line}p" "$input_file" >> "$output_file"
    echo "" >> "$output_file"
    
    return 0
}

# Updated pre-filter function with choice of extraction methods
pre_filter_dump() {
    print_status "Pre-filtering MySQL dump..."
    
    if [ ! -z "$SPECIFIC_TABLES" ]; then
        print_status "Filtering for specific tables: $SPECIFIC_TABLES"
        
        IFS=',' read -ra TABLE_ARRAY <<< "$SPECIFIC_TABLES"
        
        print_status "Extracting dump header..."
        awk '/^CREATE TABLE/ {exit} {print}' "$INPUT_FILE" > "$FILTERED_MYSQL_FILE"
        
        # Extract each table
        for table in "${TABLE_ARRAY[@]}"; do
            print_status "Extracting table: $table"
            
            # Check if table exists first
            if ! grep -q "CREATE TABLE.*\`$table\`" "$INPUT_FILE"; then
                print_warning "Table '$table' not found in dump file"
                continue
            fi
            
            # Extract DROP TABLE statement if exists
            grep "^DROP TABLE.*\`$table\`" "$INPUT_FILE" >> "$FILTERED_MYSQL_FILE" 2>/dev/null || true
            
            # Try the simple extraction method first (preserves original structure)
            if ! extract_table_definition "$table" "$INPUT_FILE" "$FILTERED_MYSQL_FILE"; then
                print_warning "Simple extraction failed, trying precise method..."
                if ! extract_table_definition_precise "$table" "$INPUT_FILE" "$FILTERED_MYSQL_FILE"; then
                    print_error "Both extraction methods failed for table $table"
                    continue
                fi
            fi
            
            # Extract INSERT statements
            print_status "  Extracting INSERT statements for $table..."
            INSERT_COUNT=$(grep -c "INSERT INTO \`$table\`" "$INPUT_FILE" 2>/dev/null || echo "0")
            print_status "  Found $INSERT_COUNT INSERT statements for $table"
            
            if [ "$INSERT_COUNT" -gt 0 ]; then
                grep "INSERT INTO \`$table\`" "$INPUT_FILE" >> "$FILTERED_MYSQL_FILE"
                ADDED_COUNT=$(grep -c "INSERT INTO \`$table\`" "$FILTERED_MYSQL_FILE" 2>/dev/null || echo "0")
                print_status "  Added $ADDED_COUNT INSERT statements to filtered file"
            else
                print_warning "  No INSERT statements found for $table"
            fi
            
            echo "" >> "$FILTERED_MYSQL_FILE"
        done
        
        # Add MySQL dump footer
        cat >> "$FILTERED_MYSQL_FILE" << 'EOF'

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
EOF
        
        ORIGINAL_SIZE=$(du -h "$INPUT_FILE" | cut -f1)
        FILTERED_SIZE=$(du -h "$FILTERED_MYSQL_FILE" | cut -f1)
        print_success "Pre-filtering completed: $ORIGINAL_SIZE → $FILTERED_SIZE"
        
        # Show summary
        print_status "Tables found in filtered dump:"
        grep "^CREATE TABLE" "$FILTERED_MYSQL_FILE" | sed 's/CREATE TABLE \`\([^`]*\)\`.*/  \1/' || print_warning "No CREATE TABLE statements found"
        
        for table in "${TABLE_ARRAY[@]}"; do
            INSERT_COUNT=$(grep -c "INSERT INTO \`$table\`" "$FILTERED_MYSQL_FILE" 2>/dev/null || echo "0")
            print_status "  $table: $INSERT_COUNT INSERT statements in filtered file"
        done
        
    else
        print_status "No table filtering specified, using original file"
        cp "$INPUT_FILE" "$FILTERED_MYSQL_FILE"
        print_success "Original file copied to: $FILTERED_MYSQL_FILE"
    fi
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
    
    # Build the configuration with optional table filtering
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
EOF

    # Add table filtering if specified
    if [ ! -z "$SPECIFIC_TABLES" ]; then
        echo "" >> "$PGLOADER_CONFIG"
        # Convert comma-separated list to quoted, comma-separated format
        TABLE_LIST=$(echo "$SPECIFIC_TABLES" | sed "s/,/', '/g" | sed "s/^/'/g" | sed "s/$/'/g")
        echo "INCLUDING ONLY TABLE NAMES MATCHING $TABLE_LIST" >> "$PGLOADER_CONFIG"
        print_status "Limiting migration to tables: $SPECIFIC_TABLES"
    fi
    
    cat >> "$PGLOADER_CONFIG" << EOF
    
    BEFORE LOAD DO
    \$\$ DROP SCHEMA IF EXISTS public CASCADE; \$\$,
    \$\$ CREATE SCHEMA public; \$\$;
EOF

    # Run pgloader with the configuration
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
        --no-owner --no-privileges --verbose 2>/dev/null | gzip > "$POSTGRES_OUTPUT_FILE"
    
    if [ ! -f "$POSTGRES_OUTPUT_FILE" ] || [ ! -s "$POSTGRES_OUTPUT_FILE" ]; then
        print_error "Failed to create PostgreSQL output file or file is empty"
        exit 1
    fi
    
    OUTPUT_SIZE=$(du -h "$POSTGRES_OUTPUT_FILE" | cut -f1)
    print_success "PostgreSQL dump exported: $POSTGRES_OUTPUT_FILE ($OUTPUT_SIZE)"
}

#!/bin/bash

# Add this function to your script to diagnose and fix the gcd_issue transfer issue

# Function to diagnose and fix pgloader issues
diagnose_and_fix_pgloader() {
    print_status "Diagnosing pgloader data transfer issues..."
    
    # Get container IPs
    MYSQL_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $MYSQL_CONTAINER_NAME)
    POSTGRES_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $POSTGRES_CONTAINER_NAME)
    
    # Check MySQL data
    print_status "Checking MySQL data..."
    MYSQL_COUNT=$(docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD source_db -se "SELECT COUNT(*) FROM gcd_issue;" 2>/dev/null)
    print_status "MySQL gcd_issue row count: $MYSQL_COUNT"
    
    # Check a sample row to see data types
    print_status "Checking MySQL table structure..."
    docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD source_db -e "DESCRIBE gcd_issue;" 2>/dev/null | head -10
    
    # Check for problematic data
    print_status "Checking for problematic data in MySQL..."
    docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD source_db -e "
        SELECT 
            COUNT(*) as total_rows,
            COUNT(CASE WHEN notes LIKE '%\\r\\n%' THEN 1 END) as rows_with_newlines,
            MAX(LENGTH(notes)) as max_notes_length,
            MAX(LENGTH(tracking_notes)) as max_tracking_notes_length
        FROM gcd_issue;
    " 2>/dev/null
    
    # Try a manual data copy with limited rows
    print_status "Testing manual data copy with pgloader (first 1000 rows)..."
    
    # Create a test table with limited data
    docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD source_db -e "
        CREATE TABLE IF NOT EXISTS gcd_issue_test AS 
        SELECT * FROM gcd_issue LIMIT 1000;
    " 2>/dev/null
    
    # Create pgloader config for test table
    cat > "/tmp/test_pgloader.load" << EOF
LOAD DATABASE
    FROM mysql://root:$MYSQL_PASSWORD@$MYSQL_IP/source_db
    INTO postgresql://postgres:$POSTGRES_PASSWORD@$POSTGRES_IP/target_db

WITH include drop, create tables, create indexes, reset sequences,
     workers = 1, concurrency = 1,
     batch rows = 100,
     batch size = 1MB

INCLUDING ONLY TABLE NAMES MATCHING 'gcd_issue_test'

BEFORE LOAD DO
\$\$ DROP TABLE IF EXISTS source_db.gcd_issue_test CASCADE; \$\$;
EOF

    # Run test pgloader
    print_status "Running test pgloader..."
    docker run --rm \
        --network $NETWORK_NAME \
        -v "/tmp/test_pgloader.load:/config.load" \
        dimitri/pgloader pgloader --verbose /config.load 2>&1 | head -50
    
    # Check if test worked
    TEST_COUNT=$(docker exec $POSTGRES_CONTAINER_NAME psql -U postgres -d target_db -tc "SELECT COUNT(*) FROM source_db.gcd_issue_test;" 2>/dev/null | tr -d ' ')
    print_status "Test transfer result: $TEST_COUNT rows copied"
    
    if [ "$TEST_COUNT" -gt 0 ]; then
        print_success "Test transfer worked! The issue might be with large data size or specific rows."
        
        # Try copying in batches
        print_status "Attempting batch copy approach..."
        run_batch_pgloader
    else
        print_warning "Test transfer failed. Trying alternative approaches..."
        
        # Try simplified table structure
        try_simplified_transfer
    fi
    
    # Cleanup
    rm -f "/tmp/test_pgloader.load"
}

# Function to try batch copying
run_batch_pgloader() {
    print_status "Attempting batch data transfer..."
    
    # Get container IPs
    MYSQL_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $MYSQL_CONTAINER_NAME)
    POSTGRES_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $POSTGRES_CONTAINER_NAME)
    
    # Create pgloader config with smaller batches and error handling
    cat > "/tmp/batch_pgloader.load" << EOF
LOAD DATABASE
    FROM mysql://root:$MYSQL_PASSWORD@$MYSQL_IP/source_db
    INTO postgresql://postgres:$POSTGRES_PASSWORD@$POSTGRES_IP/target_db

WITH include drop, create tables, create indexes, reset sequences,
     workers = 1, concurrency = 1,
     batch rows = 5000,
     batch size = 5MB,
     prefetch rows = 1000

INCLUDING ONLY TABLE NAMES MATCHING 'gcd_issue'

CAST column gcd_issue.notes to text drop typemod,
     column gcd_issue.tracking_notes to text drop typemod,
     column gcd_issue.editing to text drop typemod

BEFORE LOAD DO
\$\$ DROP SCHEMA IF EXISTS source_db CASCADE; \$\$,
\$\$ CREATE SCHEMA source_db; \$\$;
EOF

    # Run batch pgloader
    print_status "Running batch pgloader with error handling..."
    docker run --rm \
        --network $NETWORK_NAME \
        -v "/tmp/batch_pgloader.load:/config.load" \
        dimitri/pgloader pgloader --verbose /config.load
    
    # Check result
    BATCH_COUNT=$(docker exec $POSTGRES_CONTAINER_NAME psql -U postgres -d target_db -tc "SELECT COUNT(*) FROM source_db.gcd_issue;" 2>/dev/null | tr -d ' ')
    print_status "Batch transfer result: $BATCH_COUNT rows copied"
    
    # Cleanup
    rm -f "/tmp/batch_pgloader.load"
}

# Function to try simplified data transfer
try_simplified_transfer() {
    print_status "Trying simplified data transfer approach..."
    
    # Create a simplified version of the table with only basic columns
    docker exec $MYSQL_CONTAINER_NAME mysql -uroot -p$MYSQL_PASSWORD source_db -e "
        CREATE TABLE gcd_issue_simple AS 
        SELECT 
            id, number, volume, series_id, 
            publication_date, key_date, 
            page_count, price, 
            created, modified, deleted,
            CASE 
                WHEN LENGTH(notes) > 1000 THEN SUBSTRING(notes, 1, 1000)
                ELSE notes 
            END as notes_truncated
        FROM gcd_issue;
    " 2>/dev/null
    
    # Get container IPs
    MYSQL_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $MYSQL_CONTAINER_NAME)
    POSTGRES_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $POSTGRES_CONTAINER_NAME)
    
    # Create pgloader config for simplified table
    cat > "/tmp/simple_pgloader.load" << EOF
LOAD DATABASE
    FROM mysql://root:$MYSQL_PASSWORD@$MYSQL_IP/source_db
    INTO postgresql://postgres:$POSTGRES_PASSWORD@$POSTGRES_IP/target_db

WITH include drop, create tables, create indexes, reset sequences,
     workers = 1, concurrency = 1,
     batch rows = 10000,
     batch size = 10MB

INCLUDING ONLY TABLE NAMES MATCHING 'gcd_issue_simple'

BEFORE LOAD DO
\$\$ DROP TABLE IF EXISTS source_db.gcd_issue_simple CASCADE; \$\$;
EOF

    # Run simplified pgloader
    print_status "Running simplified pgloader..."
    docker run --rm \
        --network $NETWORK_NAME \
        -v "/tmp/simple_pgloader.load:/config.load" \
        dimitri/pgloader pgloader --verbose /config.load
    
    # Check result
    SIMPLE_COUNT=$(docker exec $POSTGRES_CONTAINER_NAME psql -U postgres -d target_db -tc "SELECT COUNT(*) FROM source_db.gcd_issue_simple;" 2>/dev/null | tr -d ' ')
    print_status "Simplified transfer result: $SIMPLE_COUNT rows copied"
    
    if [ "$SIMPLE_COUNT" -gt 0 ]; then
        print_success "Simplified transfer worked! The issue is likely with text fields or data size."
        print_status "You can use the gcd_issue_simple table or modify the original approach."
    fi
    
    # Cleanup
    rm -f "/tmp/simple_pgloader.load"
}

# Updated run_pgloader function with diagnostics
run_pgloader_with_diagnostics() {
    print_status "Running pgloader migration with diagnostics..."
    
    # First try the normal approach
    run_pgloader
    
    # Check if any data was transferred
    POSTGRES_COUNT=$(docker exec $POSTGRES_CONTAINER_NAME psql -U postgres -d target_db -tc "SELECT COUNT(*) FROM source_db.gcd_issue;" 2>/dev/null | tr -d ' ')
    
    if [ "$POSTGRES_COUNT" = "0" ] || [ -z "$POSTGRES_COUNT" ]; then
        print_warning "No data transferred. Running diagnostics..."
        diagnose_and_fix_pgloader
    else
        print_success "Data transfer successful: $POSTGRES_COUNT rows"
    fi
}
# Function to show summary
show_summary() {
    echo ""
    echo "========================================="
    echo "           CONVERSION SUMMARY"
    echo "========================================="
    echo "Input file:           $INPUT_FILE"
    echo "Filtered MySQL file:  $FILTERED_MYSQL_FILE"
    echo "PostgreSQL file:      $POSTGRES_OUTPUT_FILE"
    echo ""
    echo "File sizes:"
    echo "  Original input:     $(du -h "$INPUT_FILE" | cut -f1)"
    echo "  Filtered MySQL:     $(du -h "$FILTERED_MYSQL_FILE" | cut -f1)"
    echo "  PostgreSQL output:  $(du -h "$POSTGRES_OUTPUT_FILE" | cut -f1)"
    echo ""
    echo "Containers used:"
    echo "  MySQL:              $MYSQL_CONTAINER_NAME"
    echo "  PostgreSQL:         $POSTGRES_CONTAINER_NAME"
    if [ ! -z "$SPECIFIC_TABLES" ]; then
        echo "  Tables migrated:    $SPECIFIC_TABLES"
    fi
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
            --tables)
                shift
                SPECIFIC_TABLES="$1"
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                if [ -z "$OUTPUT_PREFIX" ]; then
                    OUTPUT_PREFIX="$1"
                else
                    print_error "Unknown option: $1"
                    show_help
                    exit 1
                fi
                ;;
        esac
        shift
    done
    
    # Set default output prefix if not provided
    if [ -z "$OUTPUT_PREFIX" ]; then
        BASE_NAME=$(basename "$INPUT_FILE" .sql)
        OUTPUT_PREFIX="$BASE_NAME"
    fi
    
    # Set output file names
    FILTERED_MYSQL_FILE="${OUTPUT_PREFIX}_mysql_filtered.sql"
    POSTGRES_OUTPUT_FILE="${OUTPUT_PREFIX}_postgres.sql.gz"
    
    # Trap to ensure cleanup on exit
    trap cleanup EXIT INT TERM
    
    print_status "Starting MySQL to PostgreSQL conversion..."
    print_status "Input: $INPUT_FILE"
    print_status "Output prefix: $OUTPUT_PREFIX"
    print_status "Filtered MySQL file: $FILTERED_MYSQL_FILE"
    print_status "PostgreSQL file: $POSTGRES_OUTPUT_FILE"
    
    # Run conversion steps
    check_prerequisites
    validate_input
    
    # Pre-filter the dump first
    pre_filter_dump
    
    # Create Docker network
    print_status "Creating Docker network..."
    docker network create $NETWORK_NAME
    
    start_mysql
    start_postgres
    import_mysql_dump
    run_pgloader_with_diagnostics
    export_postgres_dump
    
    show_summary
    print_success "Conversion completed successfully!"
    print_success "Output files created:"
    print_success "  Filtered MySQL: $FILTERED_MYSQL_FILE"
    print_success "  PostgreSQL:     $POSTGRES_OUTPUT_FILE"
}

# Run main function
main "$@"