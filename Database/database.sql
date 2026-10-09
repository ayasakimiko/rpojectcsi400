CREATE TABLE IF NOT EXISTS Room (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    room_number INT UNSIGNED NOT NULL UNIQUE CHECK (room_number BETWEEN 100 AND 999),
    is_booked BOOLEAN NOT NULL DEFAULT FALSE,
    price DECIMAL(10,2) NOT NULL,
    air_conditioner BOOLEAN DEFAULT FALSE,
    wifi BOOLEAN DEFAULT FALSE,
    refrigerator BOOLEAN DEFAULT FALSE,
    bed TINYINT UNSIGNED CHECK (bed BETWEEN 0 AND 99),
    bathroom BOOLEAN DEFAULT FALSE,
    cctv BOOLEAN DEFAULT FALSE,
    electricity_unit_price DECIMAL(10,2) NOT NULL DEFAULT 8.00 CHECK (electricity_unit_price BETWEEN 0 AND 99.99),
    water_price DECIMAL(10,2) NOT NULL DEFAULT 100.00 CHECK (water_price BETWEEN 0 AND 999.99),
    
    rental_duration_months INT UNSIGNED,
    rental_start_date DATETIME,
    rental_end_date DATETIME,
    
    prepaid_until DATETIME,
    pending_lump_sum_months INT UNSIGNED,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Customer (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    role VARCHAR(20) NOT NULL DEFAULT 'Customer',
    idcard VARCHAR(20) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    age INT UNSIGNED NOT NULL,
    room_number INT UNSIGNED,
    deposit_amount DECIMAL(10,2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (room_number) REFERENCES Room(room_number) ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Staff (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    role VARCHAR(20) NOT NULL DEFAULT 'Staff',
    idcard VARCHAR(20) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    age INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Admin (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    role VARCHAR(20) NOT NULL DEFAULT 'Staff',
    idcard VARCHAR(20) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    age INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Owner (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    role VARCHAR(20) NOT NULL DEFAULT 'Staff',
    idcard VARCHAR(20) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    age INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Booking (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    customer_id INT UNSIGNED NOT NULL,
    room_id INT NOT NULL,
    rental_start_date DATETIME NULL,
    rental_end_date DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_id) REFERENCES Customer(id),
    FOREIGN KEY (room_id) REFERENCES Room(id)
);

CREATE TABLE IF NOT EXISTS Payment (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    booking_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    type VARCHAR(20) NOT NULL DEFAULT 'rent',
    note VARCHAR(255),
    slip_path VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (booking_id) REFERENCES Booking(id)
);

CREATE TABLE IF NOT EXISTS MaintenanceRequest (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    customer_id INT UNSIGNED NOT NULL,
    room_number INT UNSIGNED NOT NULL,
    description VARCHAR(500) NOT NULL,
    category VARCHAR(20) NOT NULL DEFAULT 'other',
    contact_phone VARCHAR(20),
    preferred_time VARCHAR(20) NOT NULL DEFAULT 'anytime',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    accepted_at DATETIME NULL,
    accepted_by_name VARCHAR(255) NULL,
    completed_at DATETIME NULL,
    completed_by_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_id) REFERENCES Customer(id)
);

CREATE TABLE IF NOT EXISTS TenantRequest (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    customer_id INT UNSIGNED NOT NULL,
    room_number INT UNSIGNED NOT NULL,
    target_room_number INT UNSIGNED NULL,
    type VARCHAR(20) NOT NULL,
    note VARCHAR(500),
    renew_duration_months INT UNSIGNED,
    renew_payment_type VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    accepted_at DATETIME NULL,
    accepted_by_name VARCHAR(255) NULL,
    completed_at DATETIME NULL,
    completed_by_name VARCHAR(255) NULL,
    move_in_date DATETIME NULL,
    move_reason VARCHAR(30) NULL,
    preferred_move_date DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (customer_id) REFERENCES Customer(id)
);

CREATE TABLE IF NOT EXISTS Expense (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    category VARCHAR(50) NOT NULL DEFAULT 'other',
    description VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    expense_date DATE NOT NULL,
    recorded_by_name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS RoomOccupancySnapshot (
    snapshot_date DATE NOT NULL PRIMARY KEY,
    total_rooms INT UNSIGNED NOT NULL,
    occupied_count INT UNSIGNED NOT NULL,
    vacant_count INT UNSIGNED NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Announcement (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    tone VARCHAR(20) NOT NULL DEFAULT 'info',
    author_name VARCHAR(255),
    expires_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS WaitingList (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    room_preference VARCHAR(100),
    note VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    submitted_by_name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS MoveOutInspection (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    room_number INT UNSIGNED NOT NULL,
    tenant_request_id INT NULL,
    tenant_name VARCHAR(255) NOT NULL,
    tenant_phone VARCHAR(20),
    checklist TEXT NOT NULL,
    damage_note VARCHAR(1000),
    photos LONGTEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    inspected_by_name VARCHAR(255),
    reviewed_at DATETIME NULL,
    updated_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX uq_move_out_inspection_tenant_request (tenant_request_id)
);

CREATE TABLE IF NOT EXISTS MaintenancePhoto (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    maintenance_request_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    data_url MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (maintenance_request_id) REFERENCES MaintenanceRequest(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Parcel (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    room_number INT UNSIGNED NOT NULL,
    customer_id INT UNSIGNED NULL,
    tracking_number VARCHAR(100),
    sender_name VARCHAR(100) NOT NULL DEFAULT 'พัสดุทั่วไป',
    description VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    staff_name VARCHAR(255),
    received_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_parcel_customer_room (customer_id, room_number),
    FOREIGN KEY (room_number) REFERENCES Room(room_number) ON UPDATE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES Customer(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ParcelPhoto (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    parcel_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (parcel_id) REFERENCES Parcel(id) ON DELETE CASCADE
);
-- Upgrade existing tables without replacing existing records.

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Announcement' AND COLUMN_NAME = 'expires_at'),
    'SELECT 1',
    'ALTER TABLE `Announcement` ADD COLUMN `expires_at` DATETIME NULL AFTER author_name'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Parcel' AND COLUMN_NAME = 'customer_id'),
    'SELECT 1',
    'ALTER TABLE `Parcel` ADD COLUMN `customer_id` INT UNSIGNED NULL AFTER room_number'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND COLUMN_NAME = 'target_room_number'),
    'SELECT 1',
    'ALTER TABLE `TenantRequest` ADD COLUMN `target_room_number` INT UNSIGNED NULL AFTER room_number'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND COLUMN_NAME = 'move_reason'),
    'SELECT 1',
    'ALTER TABLE `TenantRequest` ADD COLUMN `move_reason` VARCHAR(30) NULL AFTER move_in_date'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND COLUMN_NAME = 'preferred_move_date'),
    'SELECT 1',
    'ALTER TABLE `TenantRequest` ADD COLUMN `preferred_move_date` DATE NULL AFTER move_reason'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND COLUMN_NAME = 'rental_start_date'),
    'SELECT 1',
    'ALTER TABLE `Booking` ADD COLUMN `rental_start_date` DATETIME NULL AFTER room_id'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND COLUMN_NAME = 'rental_end_date'),
    'SELECT 1',
    'ALTER TABLE `Booking` ADD COLUMN `rental_end_date` DATETIME NULL AFTER rental_start_date'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection' AND COLUMN_NAME = 'tenant_request_id'),
    'SELECT 1',
    'ALTER TABLE `MoveOutInspection` ADD COLUMN `tenant_request_id` INT NULL AFTER room_number'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection' AND COLUMN_NAME = 'updated_at'),
    'SELECT 1',
    'ALTER TABLE `MoveOutInspection` ADD COLUMN `updated_at` DATETIME NULL AFTER reviewed_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection'
              AND COLUMN_NAME = 'tenant_request_id' AND NON_UNIQUE = 0
              AND INDEX_NAME IN (
                  SELECT INDEX_NAME FROM information_schema.STATISTICS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection'
                  GROUP BY INDEX_NAME HAVING COUNT(*) = 1
              )),
    'SELECT 1',
    'ALTER TABLE `MoveOutInspection` ADD UNIQUE INDEX `uq_move_out_inspection_tenant_request` (`tenant_request_id`)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

-- Backfill existing records for room transfers and parcel ownership.

UPDATE TenantRequest tr
     JOIN MoveOutInspection moi ON moi.tenant_request_id = tr.id
     SET tr.status = CASE WHEN tr.status = 'pending' THEN 'in_progress' ELSE tr.status END,
         tr.accepted_at = COALESCE(tr.accepted_at, moi.created_at),
         tr.accepted_by_name = COALESCE(tr.accepted_by_name, moi.inspected_by_name)
     WHERE tr.type = 'move_room'
       AND tr.status IN ('pending', 'in_progress')
       AND (tr.status = 'pending' OR tr.accepted_at IS NULL OR tr.accepted_by_name IS NULL);

UPDATE Parcel p
     SET p.customer_id = (
       SELECT c.id FROM Customer c
       WHERE c.room_number = p.room_number AND c.is_suspended = FALSE
       ORDER BY c.id DESC
       LIMIT 1
     )
     WHERE p.customer_id IS NULL
       AND EXISTS (
         SELECT 1 FROM Customer c
         WHERE c.room_number = p.room_number AND c.is_suspended = FALSE
       );
