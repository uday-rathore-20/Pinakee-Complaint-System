-- PINakee Complaint Management System Migration 002
-- Target Database: pinakee_complaint_system
-- Engine: PostgreSQL

-- Create Complaint Attachments Table
CREATE TABLE IF NOT EXISTS complaint_attachments (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_size INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Optimize queries searching for attachments belonging to a complaint
CREATE INDEX IF NOT EXISTS idx_attachments_complaint ON complaint_attachments(complaint_id);
