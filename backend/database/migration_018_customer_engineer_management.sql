-- Migration 018: Customer and Engineer Account Management Expansion
-- Target Database: pinakee_complaint_system

-- 1. Sequences for Auto-generated Identifiers
CREATE SEQUENCE IF NOT EXISTS customer_code_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS engineer_code_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS location_code_seq START WITH 1;

-- 2. Customer Profiles Table
CREATE TABLE IF NOT EXISTS customer_profiles (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_code VARCHAR(50) UNIQUE NOT NULL,
    company_name VARCHAR(255) NOT NULL DEFAULT '',
    customer_type VARCHAR(50) NOT NULL DEFAULT 'Company',
    alternate_mobile VARCHAR(30),
    alternate_email VARCHAR(100),
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    gst_number VARCHAR(50),
    pan_number VARCHAR(50),
    website VARCHAR(255),
    customer_category VARCHAR(100),
    is_amc BOOLEAN DEFAULT FALSE,
    is_warranty BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_user ON customer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_code ON customer_profiles(customer_code);

-- 3. Customer Service Locations Table
CREATE TABLE IF NOT EXISTS customer_service_locations (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_code VARCHAR(50) UNIQUE NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    contact_person VARCHAR(100),
    contact_number VARCHAR(30),
    email VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_service_locations_customer ON customer_service_locations(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_locations_active ON customer_service_locations(customer_id, is_active);

-- 4. Customer Contacts Table
CREATE TABLE IF NOT EXISTS customer_contacts (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    designation VARCHAR(100),
    mobile VARCHAR(30) NOT NULL,
    email VARCHAR(100) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);

-- 5. Engineer Profiles Table
CREATE TABLE IF NOT EXISTS engineer_profiles (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    engineer_code VARCHAR(50) UNIQUE NOT NULL,
    employee_id VARCHAR(50),
    profile_photo TEXT,
    date_of_birth DATE,
    gender VARCHAR(20),
    official_mobile VARCHAR(30),
    official_email VARCHAR(100),
    alternate_mobile VARCHAR(30),
    personal_email VARCHAR(100),
    emergency_contact VARCHAR(100),
    designation VARCHAR(100) NOT NULL DEFAULT 'Field Service Engineer',
    department VARCHAR(100) DEFAULT 'IT Support',
    joining_date DATE,
    employment_type VARCHAR(50) DEFAULT 'FULL_TIME',
    engineer_status VARCHAR(50) DEFAULT 'ACTIVE',
    base_location VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_engineer_profiles_user ON engineer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_engineer_profiles_code ON engineer_profiles(engineer_code);

-- 6. Skills & Engineer Skills Tables
CREATE TABLE IF NOT EXISTS skills (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100) DEFAULT 'Technical',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS engineer_skills (
    id SERIAL PRIMARY KEY,
    engineer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (engineer_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_engineer_skills_eng ON engineer_skills(engineer_id);

-- 7. Expertise Types & Engineer Expertise Tables
CREATE TABLE IF NOT EXISTS expertise_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS engineer_expertise (
    id SERIAL PRIMARY KEY,
    engineer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expertise_id INT NOT NULL REFERENCES expertise_types(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (engineer_id, expertise_id)
);

CREATE INDEX IF NOT EXISTS idx_engineer_expertise_eng ON engineer_expertise(engineer_id);

-- 8. Alter Complaints Table to Support Service Locations
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS service_location_id INT REFERENCES customer_service_locations(id) ON DELETE SET NULL;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS service_address_snapshot TEXT;

-- 9. Seed Technical Skills
INSERT INTO skills (name, category) VALUES
('Server', 'Infrastructure'),
('Networking', 'Network'),
('CCTV', 'Security'),
('Printer', 'Hardware'),
('Desktop', 'Hardware'),
('Laptop', 'Hardware'),
('Windows', 'OS'),
('Linux', 'OS'),
('Hardware', 'General'),
('Firewall', 'Network'),
('Wireless', 'Network'),
('VoIP', 'Telecom'),
('Other', 'General')
ON CONFLICT (name) DO NOTHING;

-- 10. Seed Service / Device Expertise Types
INSERT INTO expertise_types (name) VALUES
('Server'),
('Desktop'),
('Laptop'),
('Printer'),
('CCTV'),
('Network Device'),
('Other')
ON CONFLICT (name) DO NOTHING;

-- 11. Seed / Backfill Canonical Customer Profile
DO $$
DECLARE
    v_cust_id INT;
    v_eng_id INT;
    v_loc_id INT;
    v_skill_net_id INT;
    v_skill_hw_id INT;
    v_skill_dt_id INT;
    v_skill_win_id INT;
    v_exp_dt_id INT;
    v_exp_net_id INT;
BEGIN
    -- Customer backfill
    SELECT id INTO v_cust_id FROM users WHERE email = 'customer@pinakee.com';
    IF v_cust_id IS NOT NULL THEN
        INSERT INTO customer_profiles (
            user_id, customer_code, company_name, customer_type,
            address_line1, city, state, pincode, country,
            is_amc, is_warranty, notes
        ) VALUES (
            v_cust_id,
            'CUST-' || LPAD(nextval('customer_code_seq')::TEXT, 4, '0'),
            'PINakee Client Corp',
            'Company',
            '742 Evergreen Terrace, Sector 4',
            'Bhopal',
            'Madhya Pradesh',
            '462001',
            'India',
            TRUE,
            FALSE,
            'Standard corporate customer account'
        ) ON CONFLICT (user_id) DO NOTHING;

        -- Primary Service Location
        INSERT INTO customer_service_locations (
            customer_id, location_code, location_name,
            address, city, state, pincode,
            contact_person, contact_number, email, is_active
        ) VALUES (
            v_cust_id,
            'LOC-' || LPAD(nextval('location_code_seq')::TEXT, 4, '0'),
            'Head Office',
            '742 Evergreen Terrace, Sector 4',
            'Bhopal',
            'Madhya Pradesh',
            '462001',
            'Valued Customer',
            '+91 98765 43210',
            'customer@pinakee.com',
            TRUE
        ) ON CONFLICT DO NOTHING;

        -- Primary Contact Person
        INSERT INTO customer_contacts (
            customer_id, name, designation, mobile, email, is_primary
        ) VALUES (
            v_cust_id,
            'Valued Customer',
            'IT Administrator',
            '+91 98765 43210',
            'customer@pinakee.com',
            TRUE
        ) ON CONFLICT DO NOTHING;
    END IF;

    -- Engineer backfill
    SELECT id INTO v_eng_id FROM users WHERE email = 'engineer@pinakee.com';
    IF v_eng_id IS NOT NULL THEN
        INSERT INTO engineer_profiles (
            user_id, engineer_code, employee_id,
            official_mobile, official_email, designation, department,
            employment_type, engineer_status, base_location,
            city, state, pincode, joining_date
        ) VALUES (
            v_eng_id,
            'ENG-' || LPAD(nextval('engineer_code_seq')::TEXT, 4, '0'),
            'EMP-001',
            '+91 91234 56789',
            'engineer@pinakee.com',
            'Field Service Engineer',
            'IT Support',
            'FULL_TIME',
            'ACTIVE',
            'PINakee Field Operations HQ, Zone 2',
            'Bhopal',
            'Madhya Pradesh',
            '462003',
            '2024-01-15'
        ) ON CONFLICT (user_id) DO NOTHING;

        -- Assign default skills
        SELECT id INTO v_skill_net_id FROM skills WHERE name = 'Networking';
        SELECT id INTO v_skill_hw_id FROM skills WHERE name = 'Hardware';
        SELECT id INTO v_skill_dt_id FROM skills WHERE name = 'Desktop';
        SELECT id INTO v_skill_win_id FROM skills WHERE name = 'Windows';

        IF v_skill_net_id IS NOT NULL THEN
            INSERT INTO engineer_skills (engineer_id, skill_id) VALUES (v_eng_id, v_skill_net_id) ON CONFLICT DO NOTHING;
        END IF;
        IF v_skill_hw_id IS NOT NULL THEN
            INSERT INTO engineer_skills (engineer_id, skill_id) VALUES (v_eng_id, v_skill_hw_id) ON CONFLICT DO NOTHING;
        END IF;
        IF v_skill_dt_id IS NOT NULL THEN
            INSERT INTO engineer_skills (engineer_id, skill_id) VALUES (v_eng_id, v_skill_dt_id) ON CONFLICT DO NOTHING;
        END IF;
        IF v_skill_win_id IS NOT NULL THEN
            INSERT INTO engineer_skills (engineer_id, skill_id) VALUES (v_eng_id, v_skill_win_id) ON CONFLICT DO NOTHING;
        END IF;

        -- Assign default expertise
        SELECT id INTO v_exp_dt_id FROM expertise_types WHERE name = 'Desktop';
        SELECT id INTO v_exp_net_id FROM expertise_types WHERE name = 'Network Device';

        IF v_exp_dt_id IS NOT NULL THEN
            INSERT INTO engineer_expertise (engineer_id, expertise_id) VALUES (v_eng_id, v_exp_dt_id) ON CONFLICT DO NOTHING;
        END IF;
        IF v_exp_net_id IS NOT NULL THEN
            INSERT INTO engineer_expertise (engineer_id, expertise_id) VALUES (v_eng_id, v_exp_net_id) ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END $$;
