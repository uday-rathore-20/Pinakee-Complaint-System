-- Migration 019: Workflow & Lifecycle Engine
-- Target Database: pinakee_complaint_system
-- Engine: PostgreSQL

-- 1. Insert missing complaint lifecycle statuses safely
INSERT INTO complaint_statuses (name, description) VALUES
('Accepted', 'Assigned engineer has accepted the service ticket and will begin work.'),
('Reopened', 'Customer rejected proposed resolution and reopened the complaint.'),
('Admin Review', 'Complaint awaiting administrative review and engineer assignment.'),
('Cancelled', 'Complaint was cancelled by the customer or administrator.')
ON CONFLICT (name) DO NOTHING;

-- 2. Add workflow reason columns to complaints table if not already present
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS hold_reason TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS reopen_reason TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 3. Ensure indexes exist for query optimization
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status_id);
CREATE INDEX IF NOT EXISTS idx_status_history_complaint ON complaint_status_history(complaint_id);
