-- Migration 015: Simplify roles and rename AGENT to ENGINEER
UPDATE roles SET name = 'ENGINEER', description = 'Technical field engineer responsible for resolving assigned complaints.' WHERE name = 'AGENT';
INSERT INTO roles (name, description) VALUES ('ENGINEER', 'Technical field engineer responsible for resolving assigned complaints.') ON CONFLICT (name) DO NOTHING;
