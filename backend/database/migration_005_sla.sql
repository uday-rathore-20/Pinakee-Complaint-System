-- migration_005_sla.sql
-- Add SLA configuration to priorities and targets to complaints

-- 1. Add sla_hours to complaint_priorities
ALTER TABLE complaint_priorities ADD COLUMN sla_hours INT DEFAULT 24 NOT NULL;

-- 2. Populate standard SLA hours based on priority names
UPDATE complaint_priorities SET sla_hours = 48 WHERE name = 'Low';
UPDATE complaint_priorities SET sla_hours = 24 WHERE name = 'Medium';
UPDATE complaint_priorities SET sla_hours = 8 WHERE name = 'High';
UPDATE complaint_priorities SET sla_hours = 2 WHERE name = 'Critical';

-- 3. Add due_date and is_sla_breached to complaints table
ALTER TABLE complaints ADD COLUMN due_date TIMESTAMP;
ALTER TABLE complaints ADD COLUMN is_sla_breached BOOLEAN DEFAULT FALSE NOT NULL;

-- 4. Create indexes for fast lookup and query optimization
CREATE INDEX idx_complaints_due_date ON complaints(due_date);
CREATE INDEX idx_complaints_sla_breached ON complaints(is_sla_breached);
