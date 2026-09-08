-- Migration 021: Milestone 3 - Field Travel, Reassignment Requests & Evidence Photos
-- Target Database: pinakee_complaint_system
-- Engine: PostgreSQL

-- 1. Travel start timestamp in field_call_reports
ALTER TABLE field_call_reports
    ADD COLUMN IF NOT EXISTS travel_start_time TIMESTAMP;

-- 2. Evidence stage classification in complaint_attachments
ALTER TABLE complaint_attachments
    ADD COLUMN IF NOT EXISTS evidence_stage VARCHAR(20) DEFAULT 'GENERAL';

CREATE INDEX IF NOT EXISTS idx_attachments_evidence_stage 
    ON complaint_attachments(complaint_id, evidence_stage);

-- 3. Normalized Reassignment Requests Table with ON DELETE RESTRICT
CREATE TABLE IF NOT EXISTS complaint_reassignment_requests (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
    requested_by_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_engineer_id INT REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    decided_by_id INT REFERENCES users(id) ON DELETE RESTRICT,
    decision_reason TEXT,
    new_engineer_id INT REFERENCES users(id) ON DELETE RESTRICT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    decided_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reassign_complaint ON complaint_reassignment_requests(complaint_id);
CREATE INDEX IF NOT EXISTS idx_reassign_status ON complaint_reassignment_requests(status);
