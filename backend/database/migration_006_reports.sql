-- migration_006_reports.sql
-- Add indexes for optimizing aggregate reporting queries

CREATE INDEX IF NOT EXISTS idx_history_new_status ON complaint_status_history(new_status_id);
CREATE INDEX IF NOT EXISTS idx_history_complaint_status ON complaint_status_history(complaint_id, new_status_id);
