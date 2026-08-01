-- Trigram search support.
--
-- pg_trgm is NOT a trusted extension, so this statement requires a superuser
-- connection. It is kept in its own migration so a privilege failure surfaces
-- here rather than half-way through creating indexes.
--
-- Additive and idempotent. Creates no tables and touches no data.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
