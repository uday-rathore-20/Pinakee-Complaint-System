-- Migration 022: Milestone 4 - SLA Resolution Reminders & Auto-Close
-- Target: PostgreSQL / pinakee_complaint_system

ALTER TABLE field_call_reports
    ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reminder_48h_sent_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS auto_closed_at TIMESTAMP;

-- High-performance index for SLA background polling
CREATE INDEX IF NOT EXISTS idx_fcr_resolution_sla 
    ON field_call_reports(status, work_close_time) 
    WHERE status = 'Submitted';
