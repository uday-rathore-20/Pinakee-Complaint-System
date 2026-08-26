-- migration_007_auth_security.sql
-- Add security hardening and password recovery fields to the users table

ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
