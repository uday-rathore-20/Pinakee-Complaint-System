-- Migration 004: In-App Notifications
-- Creates in_app_notifications table to support in-app alerting.

CREATE TABLE IF NOT EXISTS in_app_notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    complaint_id INT REFERENCES complaints(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read ON in_app_notifications(user_id, is_read);
