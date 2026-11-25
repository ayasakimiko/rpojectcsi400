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

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RepairJob' AND COLUMN_NAME = 'technician_phone'),
    'SELECT 1',
    'ALTER TABLE `RepairJob` ADD COLUMN `technician_phone` VARCHAR(20) NULL AFTER `technician_name`, ADD COLUMN `external_ref` VARCHAR(100) NULL AFTER `vendor_id`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

-- partner systems (e.g. RenoCare) that push status webhooks to us instead of polling /api/repair/v1
CREATE TABLE IF NOT EXISTS RepairVendorIntegration (
    vendor_id INT NOT NULL PRIMARY KEY,
    building_ref VARCHAR(40) NOT NULL UNIQUE,
    partner_api_key_cipher VARCHAR(1024) NULL,
    webhook_secret_cipher VARCHAR(1024) NULL,
    owner_email VARCHAR(255) NULL,
    updated_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (vendor_id) REFERENCES RepairVendor(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS RepairWebhookEvent (
    id BIGINT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    vendor_id INT NOT NULL,
    event_key CHAR(64) NOT NULL,
    job_id INT NULL,
    status VARCHAR(20) NULL,
    result VARCHAR(20) NOT NULL DEFAULT 'processing',
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_repair_webhook_event (vendor_id, event_key),
    INDEX idx_repair_webhook_received (vendor_id, received_at),
    FOREIGN KEY (vendor_id) REFERENCES RepairVendor(id) ON DELETE CASCADE
);

-- repair contracts (quote + materials + schedule) a vendor submits for the dorm to approve before work starts
CREATE TABLE IF NOT EXISTS RepairContract (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    job_id INT NOT NULL,
    vendor_id INT NOT NULL,
    contract_no VARCHAR(20) NOT NULL,
    contract_type VARCHAR(10) NOT NULL DEFAULT 'main',
    parent_contract_no VARCHAR(20) NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'pending',
    billing_type VARCHAR(10) NOT NULL,
    rate DECIMAL(12,2) NOT NULL,
    period_qty INT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    labor_amount DECIMAL(12,2) NOT NULL,
    material_amount DECIMAL(12,2) NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    terms TEXT NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 1,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    decided_at TIMESTAMP NULL DEFAULT NULL,
    decided_by_name VARCHAR(255) NULL,
    decision_note VARCHAR(500) NULL,
    cancelled_at TIMESTAMP NULL DEFAULT NULL,
    cancel_reason VARCHAR(500) NULL,

    UNIQUE KEY uq_repair_contract_job_no (job_id, contract_no),
    INDEX idx_repair_contract_vendor_updated (vendor_id, updated_at),
    INDEX idx_repair_contract_status (status, updated_at),
    FOREIGN KEY (job_id) REFERENCES RepairJob(id) ON DELETE CASCADE,
    FOREIGN KEY (vendor_id) REFERENCES RepairVendor(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS RepairContractItem (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    contract_id INT NOT NULL,
    line_no SMALLINT UNSIGNED NOT NULL,
    description VARCHAR(200) NOT NULL,
    qty DECIMAL(12,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,

    INDEX idx_repair_contract_item (contract_id, line_no),
    FOREIGN KEY (contract_id) REFERENCES RepairContract(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS RepairContractInstallment (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    contract_id INT NOT NULL,
    installment_no SMALLINT UNSIGNED NOT NULL,
    description VARCHAR(200) NOT NULL,
    due_date DATE NULL,
    amount DECIMAL(12,2) NOT NULL,

    INDEX idx_repair_contract_installment (contract_id, installment_no),
    FOREIGN KEY (contract_id) REFERENCES RepairContract(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS RepairContractFile (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    contract_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(64) NOT NULL,
    mime_type VARCHAR(40) NOT NULL,
    size_bytes INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_repair_contract_file (contract_id),
    FOREIGN KEY (contract_id) REFERENCES RepairContract(id) ON DELETE CASCADE
);
