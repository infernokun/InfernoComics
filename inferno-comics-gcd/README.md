# Original behavior - create new database 'gcd'
python migrate.py comics.db

# Use existing database
python migrate.py comics.db --existing-db myexistingdb

# Migrate specific tables to existing database
python migrate.py comics.db --existing-db mydb --tables gcd_series,gcd_issue

# Replace tables completely (drop and recreate)
python migrate.py comics.db --existing-db mydb --replace-tables

# Combine all options
python migrate.py comics.db --existing-db mydb --tables table1,table2 --replace-tables
python migrate.py gcd_sqlite/2025-07-01.db --existing-db inferno-comics --tables gcd_series,gcd_issue --replace-tables