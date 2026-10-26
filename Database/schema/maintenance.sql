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

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MaintenanceRequest' AND INDEX_NAME = 'idx_maintenance_customer_created'),
    'SELECT 1',
    'CREATE INDEX `idx_maintenance_customer_created` ON `MaintenanceRequest` (customer_id, created_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MaintenanceRequest' AND INDEX_NAME = 'idx_maintenance_room_created'),
    'SELECT 1',
    'CREATE INDEX `idx_maintenance_room_created` ON `MaintenanceRequest` (room_number, created_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MaintenanceRequest' AND INDEX_NAME = 'idx_maintenance_status_completed'),
    'SELECT 1',
    'CREATE INDEX `idx_maintenance_status_completed` ON `MaintenanceRequest` (status, completed_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

UPDATE MaintenanceRequest mr
     JOIN Customer c ON c.id = mr.customer_id
     SET mr.status = 'cancelled', mr.completed_at = NOW(),
         mr.completed_by_name = CASE WHEN c.is_suspended = TRUE
           THEN 'ระบบ (ระงับผู้เช่า)' ELSE 'ระบบ (เปลี่ยนห้อง)' END
     WHERE mr.status IN ('pending', 'in_progress')
       AND (c.is_suspended = TRUE OR c.room_number IS NULL OR mr.room_number <> c.room_number);

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
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MaintenanceRequest' AND INDEX_NAME = 'idx_maintenance_room_status'),
    'SELECT 1',
    'CREATE INDEX `idx_maintenance_room_status` ON `MaintenanceRequest` (room_number, status)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

CREATE TABLE IF NOT EXISTS RepairVendor (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_name VARCHAR(150) NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NULL,
    specialties VARCHAR(255) NOT NULL DEFAULT '',
    contract_type VARCHAR(10) NOT NULL DEFAULT 'monthly',
    contract_start DATE NOT NULL,
    contract_end DATE NOT NULL,
    contract_fee DECIMAL(12,2) NULL,
    webhook_url VARCHAR(500) NULL,
    note VARCHAR(500) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_name VARCHAR(255) NOT NULL,
    updated_by_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS RepairVendorApiKey (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    vendor_id INT NOT NULL,
    label VARCHAR(100) NOT NULL,
    key_prefix CHAR(14) NOT NULL UNIQUE,
    key_hash CHAR(64) NOT NULL,
    key_cipher VARCHAR(255) NULL,
    created_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME NULL,
    revoked_at DATETIME NULL,
    revoked_by_name VARCHAR(255) NULL,

    INDEX idx_repair_vendor_key_vendor (vendor_id),
    FOREIGN KEY (vendor_id) REFERENCES RepairVendor(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS RepairJob (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    vendor_id INT NOT NULL,
    maintenance_request_id INT NULL,
    room_number INT UNSIGNED NOT NULL,
    category VARCHAR(20) NOT NULL DEFAULT 'other',
    urgency VARCHAR(10) NOT NULL DEFAULT 'normal',
    description VARCHAR(1000) NOT NULL,
    contact_phone VARCHAR(20) NULL,
    preferred_time VARCHAR(20) NOT NULL DEFAULT 'anytime',
    status VARCHAR(20) NOT NULL DEFAULT 'sent',
    vendor_note VARCHAR(500) NULL,
    technician_name VARCHAR(150) NULL,
    scheduled_at DATETIME NULL,
    sent_by_name VARCHAR(255) NOT NULL,
    accepted_at DATETIME NULL,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    cancel_reason VARCHAR(500) NULL,
    status_updated_at DATETIME NULL,
    status_updated_by VARCHAR(255) NULL,
    webhook_status VARCHAR(20) NULL,
    webhook_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_repair_job_vendor_status (vendor_id, status, created_at),
    INDEX idx_repair_job_status (status, created_at),
    INDEX idx_repair_job_request (maintenance_request_id),
    FOREIGN KEY (vendor_id) REFERENCES RepairVendor(id),
    FOREIGN KEY (maintenance_request_id) REFERENCES MaintenanceRequest(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS RepairVendorImage (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    vendor_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    file_name VARCHAR(64) NOT NULL,
    created_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_repair_vendor_image_vendor (vendor_id),
    FOREIGN KEY (vendor_id) REFERENCES RepairVendor(id) ON DELETE CASCADE
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RepairVendor' AND COLUMN_NAME = 'specialty_other'),
    'SELECT 1',
    'ALTER TABLE `RepairVendor` ADD COLUMN `specialty_other` VARCHAR(150) NULL AFTER `specialties`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RepairJob' AND COLUMN_NAME = 'details_updated_at'),
    'SELECT 1',
    'ALTER TABLE `RepairJob` ADD COLUMN `details_updated_at` DATETIME NULL AFTER `status_updated_by`, ADD COLUMN `details_updated_by` VARCHAR(255) NULL AFTER `details_updated_at`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;
