-- The job queue has never been used, and pg-boss creates its schema at start. Dropping the old one avoids depending on a migration path between major versions
DROP SCHEMA IF EXISTS "pgboss" CASCADE;
