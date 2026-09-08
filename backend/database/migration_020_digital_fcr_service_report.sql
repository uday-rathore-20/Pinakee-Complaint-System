-- Migration 020: Digital FCR / Service Report Expansion
-- Target Database: pinakee_complaint_system

-- 1. Sequence for auto-generating sequential FCR numbers
CREATE SEQUENCE IF NOT EXISTS fcr_number_seq START WITH 1;

-- 2. Expand field_call_reports table with technical, network, timing, and remark columns
ALTER TABLE field_call_reports
    ADD COLUMN IF NOT EXISTS fcr_number VARCHAR(50) UNIQUE,
    ADD COLUMN IF NOT EXISTS call_type VARCHAR(50) DEFAULT 'Breakdown',
    ADD COLUMN IF NOT EXISTS problem_reported TEXT,
    ADD COLUMN IF NOT EXISTS diagnosed_problem TEXT,
    ADD COLUMN IF NOT EXISTS resolution TEXT,
    ADD COLUMN IF NOT EXISTS suggestion_to_client TEXT,
    ADD COLUMN IF NOT EXISTS engineer_remarks TEXT,
    ADD COLUMN IF NOT EXISTS client_remarks TEXT,
    ADD COLUMN IF NOT EXISTS delay_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS error_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50),
    ADD COLUMN IF NOT EXISTS subnet_mask VARCHAR(50),
    ADD COLUMN IF NOT EXISTS gateway VARCHAR(50),
    ADD COLUMN IF NOT EXISTS preferred_dns VARCHAR(50),
    ADD COLUMN IF NOT EXISTS alternate_dns VARCHAR(50),
    ADD COLUMN IF NOT EXISTS call_start_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reached_site_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS work_start_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS work_close_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS call_close_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS customer_sign_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customer_signature_data TEXT,
    ADD COLUMN IF NOT EXISTS engineer_sign_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS engineer_signature_data TEXT;

-- 3. Create Child Table: service_report_devices
CREATE TABLE IF NOT EXISTS service_report_devices (
    id SERIAL PRIMARY KEY,
    service_report_id INT NOT NULL REFERENCES field_call_reports(id) ON DELETE CASCADE,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    device_category VARCHAR(100),
    model VARCHAR(100),
    verified_model VARCHAR(100),
    serial_number VARCHAR(100),
    verified_serial_number VARCHAR(100),
    connected_device_serial_number VARCHAR(100),
    customer_machine_id VARCHAR(100),
    site_id VARCHAR(100),
    location_branch VARCHAR(255),
    line_site_side_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sr_devices_fcr ON service_report_devices(service_report_id);
CREATE INDEX IF NOT EXISTS idx_sr_devices_complaint ON service_report_devices(complaint_id);

-- 4. Create Child Table: service_report_parts
CREATE TABLE IF NOT EXISTS service_report_parts (
    id SERIAL PRIMARY KEY,
    service_report_id INT NOT NULL REFERENCES field_call_reports(id) ON DELETE CASCADE,
    complaint_id INT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    part_name VARCHAR(255) NOT NULL,
    old_serial_number VARCHAR(100),
    new_serial_number VARCHAR(100),
    quantity INT DEFAULT 1 NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sr_parts_fcr ON service_report_parts(service_report_id);
CREATE INDEX IF NOT EXISTS idx_sr_parts_complaint ON service_report_parts(complaint_id);

-- 5. Backfill any existing FCR rows with sequential fcr_number if missing
DO $$
DECLARE
    r RECORD;
    v_seq INT;
    v_year_month TEXT;
    v_fcr_num TEXT;
BEGIN
    v_year_month := to_char(CURRENT_DATE, 'YYYY-MM');
    FOR r IN SELECT id FROM field_call_reports WHERE fcr_number IS NULL OR fcr_number = '' ORDER BY id ASC LOOP
        v_seq := nextval('fcr_number_seq');
        v_fcr_num := 'FCR-' || v_year_month || '-' || LPAD(v_seq::TEXT, 4, '0');
        UPDATE field_call_reports SET fcr_number = v_fcr_num WHERE id = r.id;
    END LOOP;
END $$;
