-- migration_014_sla_pause_resume.sql
-- SLA Pause & Resume Lifecycle schema update

-- Add new statuses to complaint_statuses if they do not exist
INSERT INTO complaint_statuses (name, description)
VALUES
    ('On Hold', 'Complaint is temporarily paused waiting for external action or materials.'),
    ('Waiting on Customer', 'Complaint is paused waiting for information or response from customer.')
ON CONFLICT (name) DO NOTHING;

-- Add new fields to complaints table if they do not exist
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS total_paused_duration INTERVAL DEFAULT '0 seconds' NOT NULL;
