-- migration_009_complaint_feedback.sql
-- Create database schema to store centralized customer satisfaction ratings and feedback comments

CREATE TABLE IF NOT EXISTS complaint_feedback (
  id SERIAL PRIMARY KEY,
  complaint_id INT REFERENCES complaints(id) ON DELETE CASCADE UNIQUE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comments TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_complaint ON complaint_feedback(complaint_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON complaint_feedback(rating);
