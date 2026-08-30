-- migration_012_sla_escalations.sql
-- Add SLA escalation tracking columns and optimized indexes to complaints table

ALTER TABLE complaints ADD COLUMN is_escalated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE complaints ADD COLUMN escalated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE complaints ADD COLUMN escalation_level INT NOT NULL DEFAULT 0;

-- Create partial index on complaints for fast query retrieval of escalated tickets
CREATE INDEX IF NOT EXISTS idx_complaints_escalated ON complaints(is_escalated) WHERE is_escalated = TRUE;
