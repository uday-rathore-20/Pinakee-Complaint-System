-- Migration 017: Add contact and location fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(100) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pincode VARCHAR(20) DEFAULT NULL;

-- Seed default contact and location details for existing canonical test accounts
UPDATE users
SET phone_number = '+91 98765 43210',
    address = '742 Evergreen Terrace, Sector 4',
    city = 'Bhopal',
    state = 'Madhya Pradesh',
    pincode = '462001'
WHERE email = 'customer@pinakee.com';

UPDATE users
SET phone_number = '+91 91234 56789',
    address = 'PINakee Field Operations HQ, Zone 2',
    city = 'Bhopal',
    state = 'Madhya Pradesh',
    pincode = '462003'
WHERE email = 'engineer@pinakee.com';

UPDATE users
SET phone_number = '+91 90000 11111',
    address = 'PINakee Corporate Tower, 5th Floor',
    city = 'Bhopal',
    state = 'Madhya Pradesh',
    pincode = '462011'
WHERE email = 'admin@pinakee.com';
