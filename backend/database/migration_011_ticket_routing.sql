-- Migration 011: Automated Ticket Routing Configuration & Department State
-- Persists routing algorithm mode and tracks round-robin rotation state.

-- 1. Create system_settings table if it does not already exist
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Trigger for updating timestamps
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_system_settings_updated_at') THEN
        CREATE TRIGGER trigger_update_system_settings_updated_at
        BEFORE UPDATE ON system_settings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 2. Seed default routing mode setting
INSERT INTO system_settings (key, value, description)
VALUES ('ticket_routing_mode', 'MANUAL', 'Active ticket auto-routing strategy (MANUAL, ROUND_ROBIN, LEAST_BUSY)')
ON CONFLICT (key) DO NOTHING;

-- 3. Add last_assigned_agent_id column to departments for Round-Robin state tracking
ALTER TABLE departments ADD COLUMN last_assigned_agent_id INT REFERENCES users(id) ON DELETE SET NULL;
