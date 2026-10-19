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
    water_unit_price DECIMAL(10,2) NOT NULL DEFAULT 100.00 CHECK (water_unit_price BETWEEN 0 AND 999.99),
    water_price DECIMAL(10,2) NOT NULL DEFAULT 100.00 CHECK (water_price BETWEEN 0 AND 999.99),
    
    rental_duration_months INT UNSIGNED,
    rental_start_date DATETIME,
    rental_end_date DATETIME,
    
    prepaid_until DATETIME,
    pending_lump_sum_months INT UNSIGNED,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'water_unit_price'),
    'SELECT 1',
    'ALTER TABLE `Room` ADD COLUMN `water_unit_price` DECIMAL(10,2) NOT NULL DEFAULT 100.00 AFTER `electricity_unit_price`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

CREATE TABLE IF NOT EXISTS DormConfig (
    id INT PRIMARY KEY DEFAULT 1,
    dorm_name VARCHAR(255) NOT NULL DEFAULT 'หอพัก',
    promptpay_id VARCHAR(50) NOT NULL DEFAULT '',
    bank_name VARCHAR(100) DEFAULT NULL,
    bank_account_no VARCHAR(50) DEFAULT NULL,
    dorm_rules TEXT,
    caretaker_phone VARCHAR(20) DEFAULT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO DormConfig (id, dorm_name, promptpay_id)
VALUES (1, 'หอพัก', '')
ON DUPLICATE KEY UPDATE id = 1;

SET @water_unit_price_needs_default = (
    SELECT COUNT(*) > 0
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'water_unit_price'
      AND COLUMN_DEFAULT IN ('0', '0.00')
);
SET @schema_upgrade_sql = IF(
    @water_unit_price_needs_default,
    'UPDATE `Room` SET `water_unit_price` = 100.00 WHERE `water_unit_price` = 0.00',
    'SELECT 1'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;
ALTER TABLE `Room` ALTER COLUMN `water_unit_price` SET DEFAULT 100.00;

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
    electricity_units DECIMAL(10,2) NULL,
    water_units DECIMAL(10,2) NULL,
    note VARCHAR(255),
    slip_path VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (booking_id) REFERENCES Booking(id)
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Payment' AND COLUMN_NAME = 'electricity_units'),
    'SELECT 1',
    'ALTER TABLE `Payment` ADD COLUMN `electricity_units` DECIMAL(10,2) NULL AFTER `type`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Payment' AND COLUMN_NAME = 'water_units'),
    'SELECT 1',
    'ALTER TABLE `Payment` ADD COLUMN `water_units` DECIMAL(10,2) NULL AFTER `electricity_units`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

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
    photos LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS AnnouncementAcknowledgement (
    announcement_id INT NOT NULL,
    customer_id INT UNSIGNED NOT NULL,
    acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (announcement_id, customer_id),
    INDEX idx_announcement_ack_customer (customer_id),
    FOREIGN KEY (announcement_id) REFERENCES Announcement(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES Customer(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS WaitingList (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    room_preference VARCHAR(100),
    note VARCHAR(500),
    desired_move_in_date DATE NULL,
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
    url VARCHAR(255) NULL,
    data_url MEDIUMTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_maintenance_photo_url (url),
    FOREIGN KEY (maintenance_request_id) REFERENCES MaintenanceRequest(id) ON DELETE CASCADE
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MaintenancePhoto' AND COLUMN_NAME = 'url'),
    'SELECT 1',
    'ALTER TABLE `MaintenancePhoto` ADD COLUMN `url` VARCHAR(255) NULL AFTER name, MODIFY `data_url` MEDIUMTEXT NULL, ADD INDEX `idx_maintenance_photo_url` (url)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

-- Default rooms (existing room numbers are left unchanged).
INSERT IGNORE INTO Room
    (room_number, is_booked, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv,
     electricity_unit_price, water_price, rental_duration_months, rental_start_date, rental_end_date, prepaid_until)
VALUES
    (101, FALSE, 3500.00, TRUE, TRUE, TRUE, 1, TRUE, TRUE, 8.00, 100.00, NULL, NULL, NULL, NULL),
    (102, FALSE, 4000.00, TRUE, TRUE, TRUE, 2, TRUE, TRUE, 8.00, 100.00, NULL, NULL, NULL, NULL),
    (103, FALSE, 3200.00, TRUE, TRUE, FALSE, 1, TRUE, TRUE, 8.00, 100.00, NULL, NULL, NULL, NULL),
    (104, FALSE, 3000.00, FALSE, TRUE, FALSE, 1, TRUE, FALSE, 8.00, 100.00, NULL, NULL, NULL, NULL),
    (105, FALSE, 4500.00, TRUE, TRUE, TRUE, 2, TRUE, TRUE, 8.00, 100.00, NULL, NULL, NULL, NULL);

UPDATE Room AS room
SET room.is_booked = FALSE,
    room.rental_duration_months = NULL,
    room.rental_start_date = NULL,
    room.rental_end_date = NULL,
    room.prepaid_until = NULL,
    room.pending_lump_sum_months = NULL
WHERE room.room_number IN (101, 102, 103)
  AND NOT EXISTS (SELECT 1 FROM Customer WHERE Customer.room_number = room.room_number)
  AND NOT EXISTS (SELECT 1 FROM Booking WHERE Booking.room_id = room.id);

-- Default staff accounts. Password for these demo accounts: test1234.
INSERT IGNORE INTO Staff
    (role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    ('Staff', '1100200000101', '$2b$10$qMWpWUdFOqo8TXKtjhMujOFGYhYxjiVW8w.SjAfhc9zP8kivpZFM2', '0844444444', 'Staff', 'Demo', FALSE, 27)
ON DUPLICATE KEY UPDATE password = VALUES(password);

INSERT IGNORE INTO Admin
    (role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    ('Admin', '1100200000201', '$2b$10$qMWpWUdFOqo8TXKtjhMujOFGYhYxjiVW8w.SjAfhc9zP8kivpZFM2', '0866666666', 'Admin', 'Demo', FALSE, 35)
ON DUPLICATE KEY UPDATE password = VALUES(password);

INSERT IGNORE INTO Owner
    (role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    ('Owner', '1100200000301', '$2b$10$qMWpWUdFOqo8TXKtjhMujOFGYhYxjiVW8w.SjAfhc9zP8kivpZFM2', '0877777777', 'Owner', 'Demo', FALSE, 45)
ON DUPLICATE KEY UPDATE password = VALUES(password);

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
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Announcement' AND COLUMN_NAME = 'photos'),
    'SELECT 1',
    'ALTER TABLE `Announcement` ADD COLUMN `photos` LONGTEXT NULL AFTER expires_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Announcement' AND COLUMN_NAME = 'popup_until'),
    'SELECT 1',
    'ALTER TABLE `Announcement` ADD COLUMN `popup_until` DATETIME NULL AFTER expires_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WaitingList' AND COLUMN_NAME = 'desired_move_in_date'),
    'SELECT 1',
    'ALTER TABLE `WaitingList` ADD COLUMN `desired_move_in_date` DATE NULL AFTER note'
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

CREATE TABLE IF NOT EXISTS ResidentVisitRequest (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    customer_id INT UNSIGNED NULL,
    room_number INT UNSIGNED NULL,
    request_type ENUM('vehicle', 'overnight_guest') NOT NULL,
    vehicle_plate VARCHAR(20) NULL,
    vehicle_model VARCHAR(100) NULL,
    vehicle_photos LONGTEXT NULL,
    guest_name VARCHAR(255) NULL,
    guest_phone VARCHAR(20) NULL,
    start_at DATETIME NOT NULL,
    end_at DATETIME NULL,
    note VARCHAR(500) NULL,
    is_special BOOLEAN NOT NULL DEFAULT FALSE,
    special_reason VARCHAR(500) NULL,
    status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    reviewed_by_name VARCHAR(255) NULL,
    reviewed_at DATETIME NULL,
    admin_reviewed_by_name VARCHAR(255) NULL,
    admin_reviewed_at DATETIME NULL,
    updated_by_name VARCHAR(255) NULL,
    updated_at DATETIME NULL,
    cancelled_by_name VARCHAR(255) NULL,
    cancelled_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_resident_visit_customer FOREIGN KEY (customer_id) REFERENCES Customer(id),
    INDEX idx_resident_visit_status (status, created_at),
    INDEX idx_resident_visit_customer (customer_id, created_at)
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ResidentVisitRequest' AND COLUMN_NAME = 'customer_id' AND IS_NULLABLE = 'NO'),
    'ALTER TABLE `ResidentVisitRequest` MODIFY COLUMN `customer_id` INT UNSIGNED NULL, MODIFY COLUMN `room_number` INT UNSIGNED NULL',
    'SELECT 1'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ResidentVisitRequest' AND COLUMN_NAME = 'vehicle_photos'),
    'SELECT 1',
    'ALTER TABLE `ResidentVisitRequest` ADD COLUMN `vehicle_photos` LONGTEXT NULL AFTER vehicle_model'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ResidentVisitRequest' AND COLUMN_NAME = 'end_at' AND IS_NULLABLE = 'NO'),
    'ALTER TABLE `ResidentVisitRequest` MODIFY COLUMN `end_at` DATETIME NULL',
    'SELECT 1'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ResidentVisitRequest' AND COLUMN_NAME = 'status'
              AND COLUMN_TYPE LIKE '%cancelled%'),
    'SELECT 1',
    'ALTER TABLE `ResidentVisitRequest` MODIFY COLUMN `status` ENUM(''pending'', ''approved'', ''rejected'', ''cancelled'') NOT NULL DEFAULT ''pending'''
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ResidentVisitRequest' AND COLUMN_NAME = 'updated_by_name'),
    'SELECT 1',
    'ALTER TABLE `ResidentVisitRequest` ADD COLUMN `updated_by_name` VARCHAR(255) NULL AFTER admin_reviewed_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ResidentVisitRequest' AND COLUMN_NAME = 'updated_at'),
    'SELECT 1',
    'ALTER TABLE `ResidentVisitRequest` ADD COLUMN `updated_at` DATETIME NULL AFTER updated_by_name'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ResidentVisitRequest' AND COLUMN_NAME = 'cancelled_by_name'),
    'SELECT 1',
    'ALTER TABLE `ResidentVisitRequest` ADD COLUMN `cancelled_by_name` VARCHAR(255) NULL AFTER updated_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ResidentVisitRequest' AND COLUMN_NAME = 'cancelled_at'),
    'SELECT 1',
    'ALTER TABLE `ResidentVisitRequest` ADD COLUMN `cancelled_at` DATETIME NULL AFTER cancelled_by_name'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

CREATE TABLE IF NOT EXISTS SafetyIncident (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    reporter_role VARCHAR(20) NOT NULL,
    reporter_id INT UNSIGNED NULL,
    reporter_name VARCHAR(255) NOT NULL,
    room_number INT UNSIGNED NULL,
    incident_type VARCHAR(80) NOT NULL,
    severity ENUM('urgent', 'normal') NOT NULL DEFAULT 'normal',
    description VARCHAR(1000) NOT NULL,
    photos LONGTEXT NULL,
    status ENUM('pending', 'reviewed', 'cancelled') NOT NULL DEFAULT 'pending',
    reviewed_by_name VARCHAR(255) NULL,
    reviewed_at DATETIME NULL,
    review_note VARCHAR(500) NULL,
    cancelled_by_name VARCHAR(255) NULL,
    cancelled_at DATETIME NULL,
    cancel_reason VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_safety_incident_status (status, created_at)
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Payment' AND INDEX_NAME = 'idx_payment_status_date'),
    'SELECT 1',
    'CREATE INDEX `idx_payment_status_date` ON `Payment` (status, payment_date)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Expense' AND INDEX_NAME = 'idx_expense_date'),
    'SELECT 1',
    'CREATE INDEX `idx_expense_date` ON `Expense` (expense_date)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Expense' AND COLUMN_NAME = 'vendor'),
    'SELECT 1',
    'ALTER TABLE `Expense` ADD COLUMN `vendor` VARCHAR(120) NULL AFTER description'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Expense' AND COLUMN_NAME = 'payment_method'),
    'SELECT 1',
    'ALTER TABLE `Expense` ADD COLUMN `payment_method` VARCHAR(20) NULL AFTER vendor'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Expense' AND COLUMN_NAME = 'receipt_number'),
    'SELECT 1',
    'ALTER TABLE `Expense` ADD COLUMN `receipt_number` VARCHAR(60) NULL AFTER payment_method'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Expense' AND COLUMN_NAME = 'room_number'),
    'SELECT 1',
    'ALTER TABLE `Expense` ADD COLUMN `room_number` INT UNSIGNED NULL AFTER receipt_number'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Expense' AND COLUMN_NAME = 'photos'),
    'SELECT 1',
    'ALTER TABLE `Expense` ADD COLUMN `photos` LONGTEXT NULL AFTER room_number'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Expense' AND COLUMN_NAME = 'deleted_at'),
    'SELECT 1',
    'ALTER TABLE `Expense` ADD COLUMN `deleted_at` TIMESTAMP NULL DEFAULT NULL AFTER created_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Expense' AND COLUMN_NAME = 'deleted_by_name'),
    'SELECT 1',
    'ALTER TABLE `Expense` ADD COLUMN `deleted_by_name` VARCHAR(255) NULL AFTER deleted_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Announcement' AND INDEX_NAME = 'idx_announcement_expires'),
    'SELECT 1',
    'CREATE INDEX `idx_announcement_expires` ON `Announcement` (expires_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND INDEX_NAME = 'idx_tenant_request_status'),
    'SELECT 1',
    'CREATE INDEX `idx_tenant_request_status` ON `TenantRequest` (status, created_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MaintenanceRequest' AND INDEX_NAME = 'idx_maintenance_status'),
    'SELECT 1',
    'CREATE INDEX `idx_maintenance_status` ON `MaintenanceRequest` (status, created_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND INDEX_NAME = 'idx_booking_customer_created'),
    'SELECT 1',
    'CREATE INDEX `idx_booking_customer_created` ON `Booking` (customer_id, created_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WaitingList' AND INDEX_NAME = 'idx_waiting_list_created'),
    'SELECT 1',
    'CREATE INDEX `idx_waiting_list_created` ON `WaitingList` (created_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SafetyIncident' AND INDEX_NAME = 'idx_safety_incident_reporter'),
    'SELECT 1',
    'CREATE INDEX `idx_safety_incident_reporter` ON `SafetyIncident` (reporter_role, reporter_id, created_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SafetyIncident' AND COLUMN_NAME = 'photos'),
    'SELECT 1',
    'ALTER TABLE `SafetyIncident` ADD COLUMN `photos` LONGTEXT NULL AFTER description'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SafetyIncident' AND COLUMN_NAME = 'cancelled_at'),
    'SELECT 1',
    'ALTER TABLE `SafetyIncident` MODIFY `status` ENUM(''pending'', ''reviewed'', ''cancelled'') NOT NULL DEFAULT ''pending'', ADD COLUMN `cancelled_by_name` VARCHAR(255) NULL AFTER review_note, ADD COLUMN `cancelled_at` DATETIME NULL AFTER cancelled_by_name, ADD COLUMN `cancel_reason` VARCHAR(500) NULL AFTER cancelled_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection' AND COLUMN_NAME = 'hidden_at'),
    'SELECT 1',
    'ALTER TABLE `MoveOutInspection` ADD COLUMN `hidden_at` DATETIME NULL, ADD COLUMN `hidden_by_name` VARCHAR(255) NULL, ADD COLUMN `hidden_tenant_request_id` INT NULL'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;
