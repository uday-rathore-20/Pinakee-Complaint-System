-- Migration 003: Field Call Reports
-- Creates field_call_reports table supporting the digital service visit sign-off flow.

CREATE TABLE IF NOT EXISTS field_call_reports (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
    visit_date DATE NOT NULL,
    visit_start_time TIME NOT NULL,
    visit_end_time TIME NOT NULL,
    diagnosis TEXT NOT NULL,
    action_taken TEXT NOT NULL,
    parts_replaced VARCHAR(255),
    activity_code VARCHAR(50) NOT NULL,
    suggestions TEXT,
    customer_feedback TEXT,
    customer_rating INT,
    status VARCHAR(20) DEFAULT 'Draft' NOT NULL,
    customer_confirmed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Trigger to automatically maintain updated_at column
DROP TRIGGER IF EXISTS trigger_update_fcr_updated_at ON field_call_reports;
CREATE TRIGGER trigger_update_fcr_updated_at
BEFORE UPDATE ON field_call_reports
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fcr_complaint ON field_call_reports(complaint_id);
