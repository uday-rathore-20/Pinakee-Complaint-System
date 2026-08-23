-- PINakee Complaint Management System Database Schema
-- Target Database: pinakee_complaint_system
-- Engine: PostgreSQL

-- Enable pgcrypto extension if needed for secure UUID generation in future milestones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean up existing objects (ensures a clean slate if rerun)
DROP TABLE IF EXISTS complaint_status_history CASCADE;
DROP TABLE IF EXISTS complaint_comments CASCADE;
DROP TABLE IF EXISTS complaints CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS complaint_categories CASCADE;
DROP TABLE IF EXISTS complaint_priorities CASCADE;
DROP TABLE IF EXISTS complaint_statuses CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- 1. Shared Trigger Function to Automatically Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Roles Table
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TRIGGER trigger_update_roles_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Departments Table
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TRIGGER trigger_update_departments_updated_at
BEFORE UPDATE ON departments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TRIGGER trigger_update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_email ON users(email);

-- 5. Complaint Statuses Table
CREATE TABLE complaint_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TRIGGER trigger_update_statuses_updated_at
BEFORE UPDATE ON complaint_statuses
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Complaint Priorities Table
CREATE TABLE complaint_priorities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TRIGGER trigger_update_priorities_updated_at
BEFORE UPDATE ON complaint_priorities
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Complaint Categories Table
CREATE TABLE complaint_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TRIGGER trigger_update_categories_updated_at
BEFORE UPDATE ON complaint_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Complaints Table
CREATE TABLE complaints (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    created_by_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES complaint_categories(id) ON DELETE RESTRICT,
    status_id INT NOT NULL REFERENCES complaint_statuses(id) ON DELETE RESTRICT,
    priority_id INT NOT NULL REFERENCES complaint_priorities(id) ON DELETE RESTRICT,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    assigned_to_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TRIGGER trigger_update_complaints_updated_at
BEFORE UPDATE ON complaints
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_complaints_ticket ON complaints(ticket_number);
CREATE INDEX idx_complaints_created_by ON complaints(created_by_id);
CREATE INDEX idx_complaints_assigned_to ON complaints(assigned_to_id);
CREATE INDEX idx_complaints_status ON complaints(status_id);
CREATE INDEX idx_complaints_department ON complaints(department_id);

-- 9. Complaint Comments Table (for audits and discussions)
CREATE TABLE complaint_comments (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_comments_complaint ON complaint_comments(complaint_id);

-- 10. Complaint Status History Table (audit trail for status movements)
CREATE TABLE complaint_status_history (
    id SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    changed_by_id INT REFERENCES users(id) ON DELETE SET NULL,
    old_status_id INT REFERENCES complaint_statuses(id) ON DELETE SET NULL,
    new_status_id INT REFERENCES complaint_statuses(id) ON DELETE SET NULL,
    remarks TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_history_complaint ON complaint_status_history(complaint_id);


-- ==========================================
-- SEED DATA INITIALIZATION
-- ==========================================

-- Populate Roles
INSERT INTO roles (name, description) VALUES
('ADMIN', 'System administrator with full system controls and configurations.'),
('DEPT_HEAD', 'Department Head managing departmental ticket routing and assignments.'),
('AGENT', 'Support representative responsible for resolving assigned complaints.'),
('CUSTOMER', 'End-user or client filing complaints.');

-- Populate Departments
INSERT INTO departments (name, description) VALUES
('IT Support', 'Resolves hardware, software, network, and system access issues.'),
('Human Resources', 'Handles personnel, payroll, training, and policy complaints.'),
('Billing & Finance', 'Deals with customer invoicing, accounts, refunds, and payment inquiries.'),
('Operations', 'Manages logistics, logistics systems, and daily operations.'),
('General', 'Fallback department for general and miscellaneous complaints.');

-- Populate Complaint Statuses
INSERT INTO complaint_statuses (name, description) VALUES
('Pending', 'Complaint registered but not yet reviewed or assigned.'),
('Assigned', 'Complaint routed to a specific department or representative.'),
('In Progress', 'Complaint currently being worked on by the agent.'),
('Resolved', 'Solution proposed and implemented. Waiting for client confirmation.'),
('Closed', 'Complaint resolved and finalized.');

-- Populate Complaint Priorities
INSERT INTO complaint_priorities (name, description) VALUES
('Low', 'Non-critical issues with low workflow impact.'),
('Medium', 'Standard issues impacting workflow but containing workarounds.'),
('High', 'Severe issues with high operational impact requiring urgent response.'),
('Critical', 'Severe business-blocking outages requiring immediate action.');

-- Populate Complaint Categories
INSERT INTO complaint_categories (name, description) VALUES
('Hardware Issue', 'Broken equipment, monitors, laptops, and peripheral defects.'),
('Software Bug', 'Errors, malfunctions, and freezes in local applications or systems.'),
('Billing Dispute', 'Incorrect charges, invoice errors, or payment refund queries.'),
('Access Request', 'Missing permissions, password resets, and account unlock requests.'),
('General Inquiry', 'Informational questions not representing system failures.');

-- Seed a Default Admin User (Password is 'admin123' bcrypt hash placeholder)
INSERT INTO users (role_id, department_id, first_name, last_name, email, password_hash, is_active)
SELECT 
    r.id, 
    d.id, 
    'Pinakee', 
    'Admin', 
    'admin@pinakee.com', 
    '$2b$10$WR3yHT476LoKzjtgz0NEHOzgqRNrsqpjjjJG8/BN5z2v3hZgRYdQi', -- Hashed 'admin123'
    true
FROM roles r
CROSS JOIN departments d
WHERE r.name = 'ADMIN' AND d.name = 'IT Support'
LIMIT 1;
