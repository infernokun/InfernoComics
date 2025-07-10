import sqlite3
import psycopg2
from psycopg2.extras import execute_values
import sys
import os
from tqdm import tqdm
import re

def create_database(pg_config, new_db_name):
    """
    Create a new PostgreSQL database
    """
    try:
        # Connect to postgres database to create new database
        conn = psycopg2.connect(**pg_config)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (new_db_name,))
        exists = cursor.fetchone()
        
        if exists:
            print(f"Database '{new_db_name}' already exists.")
            response = input("Drop and recreate? (y/N): ")
            if response.lower() == 'y':
                cursor.execute(f'DROP DATABASE "{new_db_name}"')
                print(f"Dropped existing database '{new_db_name}'")
            else:
                print("Using existing database.")
                conn.close()
                return True
        
        if not exists or response.lower() == 'y':
            cursor.execute(f'CREATE DATABASE "{new_db_name}"')
            print(f"Created database '{new_db_name}'")
        
        conn.close()
        return True
        
    except psycopg2.Error as e:
        print(f"Error creating database: {e}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

def check_existing_database(pg_config, db_name):
    """
    Check if a database exists and can be connected to
    """
    try:
        test_config = pg_config.copy()
        test_config['database'] = db_name
        
        conn = psycopg2.connect(**test_config)
        conn.close()
        return True
    except psycopg2.Error:
        return False

def map_sqlite_to_postgres_type(sqlite_type):
    """
    Map SQLite data types to PostgreSQL data types
    """
    type_mapping = {
        'INTEGER': 'INTEGER',
        'varchar(255)': 'VARCHAR(255)',
        'varchar(50)': 'VARCHAR(50)',
        'varchar(32)': 'VARCHAR(32)',
        'varchar(38)': 'VARCHAR(38)',
        'varchar(13)': 'VARCHAR(13)',
        'varchar(10)': 'VARCHAR(10)',
        'longtext': 'TEXT',
        'datetime': 'TIMESTAMP',
        'decimal(10,3)': 'DECIMAL(10,3)',
        'TEXT': 'TEXT'
    }
    return type_mapping.get(sqlite_type, 'TEXT')

def analyze_column_data(sqlite_cursor, table_name, column_name, sample_size=1000):
    """
    Analyze column data to determine the best PostgreSQL type
    """
    # Get sample data
    sqlite_cursor.execute(f"SELECT {column_name} FROM {table_name} WHERE {column_name} IS NOT NULL LIMIT {sample_size}")
    sample_data = [row[0] for row in sqlite_cursor.fetchall()]
    
    if not sample_data:
        return 'TEXT'
    
    # Check if all values are integers
    all_integers = True
    all_booleans = True
    all_dates = True
    
    for value in sample_data:
        str_value = str(value).strip()
        
        # Check integer
        if all_integers:
            try:
                int(str_value)
            except (ValueError, TypeError):
                all_integers = False
        
        # Check boolean (0/1 or true/false)
        if all_booleans:
            if str_value.lower() not in ['0', '1', 'true', 'false', 't', 'f']:
                all_booleans = False
        
        # Check date formats
        if all_dates:
            if not re.match(r'^\d{4}-\d{2}-\d{2}', str_value):
                all_dates = False
    
    # Determine best type
    if all_integers:
        # Check if it's a boolean (only 0s and 1s)
        if all_booleans and all(str(v).strip() in ['0', '1'] for v in sample_data):
            return 'INTEGER'  # Keep as INTEGER for JPA compatibility
        return 'BIGINT'  # Use BIGINT for IDs and large integers
    elif all_dates:
        return 'DATE'
    else:
        return 'TEXT'

def get_optimized_postgres_type(sqlite_cursor, table_name, column_name, sqlite_type, is_pk=False):
    """
    Get the optimal PostgreSQL type based on SQLite type and data analysis
    """
    # First check explicit type mappings
    explicit_mappings = {
        'varchar(255)': 'VARCHAR(255)',
        'varchar(50)': 'VARCHAR(50)',
        'varchar(32)': 'VARCHAR(32)',
        'varchar(38)': 'VARCHAR(38)',
        'varchar(13)': 'VARCHAR(13)',
        'varchar(10)': 'VARCHAR(10)',
        'longtext': 'TEXT',
        'datetime': 'TIMESTAMP',
        'decimal(10,3)': 'DECIMAL(10,3)',
    }
    
    # If we have an explicit mapping, use it
    if sqlite_type.lower() in [k.lower() for k in explicit_mappings.keys()]:
        return explicit_mappings.get(sqlite_type.lower(), explicit_mappings.get(sqlite_type))
    
    # For TEXT and INTEGER, analyze the actual data
    if sqlite_type.upper() in ['TEXT', 'INTEGER'] or is_pk:
        analyzed_type = analyze_column_data(sqlite_cursor, table_name, column_name)
        
        # Override for primary keys - they should be BIGINT
        if is_pk and analyzed_type in ['INTEGER', 'BIGINT']:
            return 'BIGINT'
        
        return analyzed_type
    
    # Default fallback
    return 'TEXT'

def create_postgres_table(cursor, table_name, columns, replace_existing=False):
    """
    Create PostgreSQL table with intelligent column types
    """
    if replace_existing:
        cursor.execute(f'DROP TABLE IF EXISTS {table_name} CASCADE')
        print(f"Dropped existing table {table_name}")
    
    column_defs = []
    for col_name, col_type, is_pk in columns:
        pk_constraint = ' PRIMARY KEY' if is_pk else ''
        column_defs.append(f'"{col_name}" {col_type}{pk_constraint}')
    
    newline = '\n'
    indent = '    '
    column_sql = f",{newline}{indent}".join(column_defs)
    create_sql = f'CREATE TABLE IF NOT EXISTS {table_name} ({newline}{indent}{column_sql}{newline});'
    
    print(f"Creating table {table_name}...")
    print(create_sql)
    cursor.execute(create_sql)
    return create_sql

def migrate_table(sqlite_path, pg_conn, table_name, batch_size=10000, replace_existing=False):
    """
    Migrate a single table from SQLite to PostgreSQL with intelligent type detection
    """
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_cursor = sqlite_conn.cursor()
    pg_cursor = pg_conn.cursor()
    
    try:
        # Get table structure
        sqlite_cursor.execute(f"PRAGMA table_info({table_name})")
        columns_info = sqlite_cursor.fetchall()
        
        # Analyze each column and determine optimal PostgreSQL type
        print(f"Analyzing column types for {table_name}...")
        columns = []
        for col_info in columns_info:
            col_name = col_info[1]
            sqlite_type = col_info[2]
            is_pk = col_info[5] == 1
            
            # Get optimized PostgreSQL type
            pg_type = get_optimized_postgres_type(sqlite_cursor, table_name, col_name, sqlite_type, is_pk)
            columns.append((col_name, pg_type, is_pk))
            
            print(f"  {col_name}: {sqlite_type} -> {pg_type}")
        
        # Rest of the migration function remains the same...
        column_names = [col[0] for col in columns]
        
        # Create table in PostgreSQL
        create_postgres_table(pg_cursor, table_name, columns, replace_existing)
        
        # Get total row count
        sqlite_cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        total_rows = sqlite_cursor.fetchone()[0]
        
        print(f"Migrating {total_rows:,} rows from {table_name}...")
        
        # Clear existing data if not replacing the table
        if not replace_existing:
            pg_cursor.execute(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE")
        
        pg_conn.commit()  # Commit truncate/create before optimizations
        
        # SPEED OPTIMIZATIONS
        # 1. Optimize PostgreSQL settings for bulk insert (only session-level settings)
        try:
            pg_cursor.execute("SET synchronous_commit = OFF")
            pg_cursor.execute("SET maintenance_work_mem = '256MB'")
            pg_cursor.execute("SET work_mem = '64MB'")
        except Exception as e:
            print(f"Warning: Could not optimize PostgreSQL settings: {e}")
        
        # 2. Use execute_values with larger page_size for faster bulk insert
        quoted_columns = ','.join([f'"{col}"' for col in column_names])
        insert_sql = f'INSERT INTO {table_name} ({quoted_columns}) VALUES %s'
        
        # Migrate data in batches with progress bar
        with tqdm(total=total_rows, desc=f"Migrating {table_name}", unit="rows") as pbar:
            offset = 0
            migrated_rows = 0
            
            while offset < total_rows:
                # Fetch batch from SQLite
                sqlite_cursor.execute(f"SELECT * FROM {table_name} LIMIT {batch_size} OFFSET {offset}")
                batch = sqlite_cursor.fetchall()
                
                if not batch:
                    break
                
                # Convert data for PostgreSQL
                processed_batch = []
                for row in batch:
                    processed_row = []
                    for i, value in enumerate(row):
                        if value is None:
                            processed_row.append(None)
                        elif columns[i][1] == 'datetime' and value:
                            processed_row.append(value)
                        else:
                            processed_row.append(value)
                    processed_batch.append(tuple(processed_row))
                
                # Use execute_values with larger page_size for speed
                execute_values(
                    pg_cursor, 
                    insert_sql, 
                    processed_batch,
                    page_size=batch_size  # Process entire batch at once
                )
                
                migrated_rows += len(batch)
                offset += batch_size
                
                # Update progress bar
                pbar.update(len(batch))
                
                # Commit every 50,000 rows to avoid long-running transactions
                if migrated_rows % 50000 == 0:
                    pg_conn.commit()
        
        # Final commit
        pg_conn.commit()
        
        # Reset PostgreSQL settings (with error handling)
        try:
            pg_cursor.execute("RESET synchronous_commit")
            pg_cursor.execute("RESET maintenance_work_mem")
            pg_cursor.execute("RESET work_mem")
        except Exception as e:
            print(f"Warning: Could not reset PostgreSQL settings: {e}")
        
        print(f"✓ Successfully migrated {table_name} ({migrated_rows:,} rows)")
        
    except Exception as e:
        print(f"✗ Error migrating {table_name}: {e}")
        pg_conn.rollback()
    
    finally:
        sqlite_conn.close()

def migrate_database(sqlite_path, pg_config, target_db_name, tables_to_migrate=None, use_existing=False, replace_tables=False):
    """
    Migrate entire database or specific tables
    """
    try:
        # Handle database creation or connection
        if use_existing:
            if not check_existing_database(pg_config, target_db_name):
                print(f"Error: Database '{target_db_name}' does not exist or cannot be accessed.")
                return
            print(f"Using existing database: {target_db_name}")
        else:
            if not create_database(pg_config, target_db_name):
                return
        
        # Update config to connect to target database
        target_config = pg_config.copy()
        target_config['database'] = target_db_name
        
        # Connect to the target database
        pg_conn = psycopg2.connect(**target_config)
        print(f"Connected to PostgreSQL database: {target_db_name}")
        
        # Get tables from SQLite
        sqlite_conn = sqlite3.connect(sqlite_path)
        sqlite_cursor = sqlite_conn.cursor()
        sqlite_cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        all_tables = [row[0] for row in sqlite_cursor.fetchall()]
        sqlite_conn.close()
        
        # Determine which tables to migrate
        if tables_to_migrate:
            tables = [t for t in tables_to_migrate if t in all_tables]
            missing_tables = [t for t in tables_to_migrate if t not in all_tables]
            if missing_tables:
                print(f"Warning: These tables were not found in SQLite: {missing_tables}")
        else:
            tables = all_tables
        
        print(f"Tables to migrate: {tables}")
        if use_existing:
            print(f"Target: Existing database '{target_db_name}'")
            if replace_tables:
                print("Mode: Replace existing tables")
            else:
                print("Mode: Append to existing tables (truncate first)")
        else:
            print(f"Target: New database '{target_db_name}'")
        print("=" * 60)
        
        # Migrate each table
        for table_name in tables:
            migrate_table(sqlite_path, pg_conn, table_name, replace_existing=replace_tables)
            print()
        
        pg_conn.close()
        print("Migration completed!")
        
    except psycopg2.Error as e:
        print(f"PostgreSQL error: {e}")
    except Exception as e:
        print(f"Error: {e}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python migrate.py <sqlite_file> [options]")
        print("\nOptions:")
        print("  --tables table1,table2,...    Migrate specific tables only")
        print("  --existing-db db_name         Use existing database instead of creating new")
        print("  --replace-tables              Drop and recreate tables (default: truncate)")
        print("\nExamples:")
        print("  python migrate.py comics.db")
        print("  python migrate.py comics.db --tables gcd_series,gcd_issue")
        print("  python migrate.py comics.db --existing-db mydb")
        print("  python migrate.py comics.db --existing-db mydb --replace-tables")
        print("\nEnvironment variables: DB_HOST, DB_USER, DB_PASS")
        return
    
    sqlite_path = sys.argv[1]
    
    # Parse command line arguments
    tables_to_migrate = None
    existing_db = None
    replace_tables = False
    
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--tables' and i + 1 < len(sys.argv):
            tables_to_migrate = sys.argv[i + 1].split(',')
            i += 2
        elif sys.argv[i] == '--existing-db' and i + 1 < len(sys.argv):
            existing_db = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == '--replace-tables':
            replace_tables = True
            i += 1
        else:
            print(f"Unknown argument: {sys.argv[i]}")
            return
    
    # Configuration
    DEFAULT_NEW_DB_NAME = 'gcd'
    target_db_name = existing_db if existing_db else DEFAULT_NEW_DB_NAME
    use_existing = existing_db is not None
    
    pg_config = {
        'host': os.getenv('DB_HOST'),
        'database': 'postgres',  # Connect to postgres to create new DB
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASS'),
        'port': 5432
    }
    
    # Validate environment variables
    required_vars = ['DB_HOST', 'DB_USER', 'DB_PASS']
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    
    if missing_vars:
        print(f"Missing environment variables: {', '.join(missing_vars)}")
        print("Please set these environment variables before running the script.")
        return
    
    print("SQLite to PostgreSQL Migration")
    print("=" * 60)
    print(f"Source: {sqlite_path}")
    print(f"Target: {pg_config['host']}:{pg_config['port']}/{target_db_name}")
    if use_existing:
        print("Mode: Using existing database")
    else:
        print("Mode: Creating new database")
    if tables_to_migrate:
        print(f"Tables: {', '.join(tables_to_migrate)}")
    print()
    
    # Confirm before proceeding
    response = input("Continue with migration? (y/N): ")
    if response.lower() != 'y':
        print("Migration cancelled.")
        return
    
    migrate_database(sqlite_path, pg_config, target_db_name, tables_to_migrate, use_existing, replace_tables)

if __name__ == "__main__":
    main()