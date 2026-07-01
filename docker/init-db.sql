-- Initialize the development database
-- This file is executed when the PostgreSQL container starts for the first time

-- Create additional databases if needed
-- CREATE DATABASE petra_ai_test;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Set up basic configuration
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = on;

-- Create a read-only user for analytics/reporting
CREATE USER petra_readonly WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE petra_ai_dev TO petra_readonly;
GRANT USAGE ON SCHEMA public TO petra_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO petra_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO petra_readonly;
