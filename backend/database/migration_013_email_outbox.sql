-- migration_013_email_outbox.sql
-- Create transactional email outbox queue schema

CREATE TABLE IF NOT EXISTS email_outbox (
    id SERIAL PRIMARY KEY,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending' NOT NULL, -- 'Pending', 'Sent', 'Failed'
    attempts INT DEFAULT 0 NOT NULL,
    last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created_at ON email_outbox(created_at);
