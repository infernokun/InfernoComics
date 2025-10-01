#!/bin/bash

python sqlite-to-psql.py 2025-10-01.db --existing-db inferno-comics --tables gcd_series,gcd_issue --replace-tables
