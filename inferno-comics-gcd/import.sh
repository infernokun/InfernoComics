./mysql-to-psql.sh 2025-07-01.sql 2025-07-01-filtered.sql.gz --tables gcd_series,gcd_issue --verbose
./mysql-to-psql.sh 2025-07-01.sql filtered --tables gcd_issue --verbose
docker run --rm -i   -v "$(pwd):/data"   postgres:17   psql -h 10.3.1.29 -U eagle -d testdb2 -f /data/2025-07-01-filtered.sql