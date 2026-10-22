-- Schema owned by the customer service. Applied by Database/migrate.js.

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

UPDATE MaintenanceRequest mr
     JOIN Customer c ON c.id = mr.customer_id
     SET mr.status = 'cancelled', mr.completed_at = NOW(),
         mr.completed_by_name = CASE WHEN c.is_suspended = TRUE
           THEN 'ระบบ (ระงับผู้เช่า)' ELSE 'ระบบ (เปลี่ยนห้อง)' END
     WHERE mr.status IN ('pending', 'in_progress')
       AND (c.is_suspended = TRUE OR c.room_number IS NULL OR mr.room_number <> c.room_number);

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

-- Close active vehicle and visitor requests for tenants who no longer occupy a room.
-- Completed visits remain unchanged in the request history.
UPDATE ResidentVisitRequest r
     JOIN Customer c ON c.id = r.customer_id
     SET r.status = 'cancelled', r.cancelled_at = NOW(),
         r.cancelled_by_name = CASE WHEN c.is_suspended = TRUE
           THEN 'ระบบ (ระงับผู้เช่า)' ELSE 'ระบบ (ผู้เช่าย้ายออก)' END
     WHERE (c.is_suspended = TRUE OR c.room_number IS NULL)
       AND (r.status = 'pending'
         OR (r.status = 'approved' AND (r.end_at IS NULL OR r.end_at > NOW())));

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

-- Preserve resolved incidents and move pending reports from former tenants into the existing log.
UPDATE SafetyIncident s
     JOIN Customer c ON s.reporter_role = 'Customer' AND c.id = s.reporter_id
     SET s.status = 'cancelled', s.cancelled_at = NOW(),
         s.cancelled_by_name = CASE WHEN c.is_suspended = TRUE
           THEN 'ระบบ (ระงับผู้เช่า)' ELSE 'ระบบ (ผู้เช่าย้ายออก)' END,
         s.cancel_reason = CASE WHEN c.is_suspended = TRUE
           THEN 'ผู้แจ้งเหตุถูกระงับการใช้งาน' ELSE 'ผู้แจ้งเหตุย้ายออกจากห้อง' END
     WHERE s.status = 'pending' AND (c.is_suspended = TRUE OR c.room_number IS NULL);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Payment' AND COLUMN_NAME = 'electricity_units'),
    'SELECT 1',
    'ALTER TABLE `Payment` ADD COLUMN `electricity_units` DECIMAL(10,2) NULL AFTER `type`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Payment' AND COLUMN_NAME = 'water_units'),
    'SELECT 1',
    'ALTER TABLE `Payment` ADD COLUMN `water_units` DECIMAL(10,2) NULL AFTER `electricity_units`'
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

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND INDEX_NAME = 'idx_tenant_request_type_status'),
    'SELECT 1',
    'CREATE INDEX `idx_tenant_request_type_status` ON `TenantRequest` (type, status, completed_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

CREATE TABLE IF NOT EXISTS PaymentSlip (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    trans_ref VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    qr_payload VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
    booking_id INT NOT NULL,
    customer_id INT UNSIGNED NOT NULL,
    slip_path VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    trans_at DATETIME NULL,
    sending_bank VARCHAR(10) NULL,
    receiving_bank VARCHAR(10) NULL,
    sender_name VARCHAR(255) NULL,
    receiver_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_payment_slip_trans_ref (trans_ref),
    UNIQUE KEY uq_payment_slip_qr_payload (qr_payload),
    KEY idx_payment_slip_booking (booking_id),
    KEY idx_payment_slip_path (slip_path)
);

CREATE TABLE IF NOT EXISTS PaymentSlipRejection (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    booking_id INT NOT NULL,
    customer_id INT UNSIGNED NOT NULL,
    slip_path VARCHAR(255) NOT NULL,
    qr_payload VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
    trans_ref VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    amount DECIMAL(10,2) NULL,
    trans_at DATETIME NULL,
    sender_name VARCHAR(255) NULL,
    receiver_name VARCHAR(255) NULL,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY idx_payment_slip_rejection_created (created_at),
    KEY idx_payment_slip_rejection_path (slip_path)
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PaymentSlip' AND COLUMN_NAME = 'is_test'),
    'SELECT 1',
    'ALTER TABLE `PaymentSlip` ADD COLUMN `is_test` BOOLEAN NOT NULL DEFAULT FALSE'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PaymentSlip' AND COLUMN_NAME = 'reviewed_by_name'),
    'SELECT 1',
    'ALTER TABLE `PaymentSlip` ADD COLUMN `reviewed_by_name` VARCHAR(255) NULL'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PaymentSlipRejection' AND COLUMN_NAME = 'reviewed_by_name'),
    'SELECT 1',
    'ALTER TABLE `PaymentSlipRejection` ADD COLUMN `reviewed_by_name` VARCHAR(255) NULL'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PaymentSlipRejection' AND COLUMN_NAME = 'sending_bank'),
    'SELECT 1',
    'ALTER TABLE `PaymentSlipRejection` ADD COLUMN `sending_bank` VARCHAR(10) NULL'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PaymentSlipRejection' AND COLUMN_NAME = 'receiving_bank'),
    'SELECT 1',
    'ALTER TABLE `PaymentSlipRejection` ADD COLUMN `receiving_bank` VARCHAR(10) NULL'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

UPDATE PaymentSlipRejection r
JOIN PaymentSlip p ON p.qr_payload = r.qr_payload
SET r.trans_ref = p.trans_ref,
    r.amount = COALESCE(r.amount, p.amount),
    r.trans_at = COALESCE(r.trans_at, p.trans_at),
    r.sending_bank = COALESCE(r.sending_bank, p.sending_bank),
    r.receiving_bank = COALESCE(r.receiving_bank, p.receiving_bank),
    r.sender_name = COALESCE(r.sender_name, p.sender_name),
    r.receiver_name = COALESCE(r.receiver_name, p.receiver_name)
WHERE r.trans_ref IS NULL AND r.qr_payload IS NOT NULL;
