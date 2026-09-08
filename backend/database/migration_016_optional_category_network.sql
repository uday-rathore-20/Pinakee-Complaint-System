-- Migration 016: Make complaint category optional and add 'Network' category

-- 1. Make category_id nullable in complaints table
ALTER TABLE complaints ALTER COLUMN category_id DROP NOT NULL;

-- 2. Add 'Network' category if it doesn't exist
INSERT INTO complaint_categories (name, description, is_active)
VALUES ('Network', 'Network connectivity, DNS, routing, firewall, and internet access issues.', true)
ON CONFLICT (name) DO NOTHING;
