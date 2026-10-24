-- Schema owned by the customer service. Applied by Database/migrate.js.

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
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND COLUMN_NAME = 'reject_reason'),
    'SELECT 1',
    'ALTER TABLE `TenantRequest` ADD COLUMN `reject_reason` VARCHAR(500) NULL AFTER preferred_move_date'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND COLUMN_NAME = 'transfer_charge_payment_id'),
    'SELECT 1',
    'ALTER TABLE `TenantRequest` ADD COLUMN `transfer_charge_payment_id` INT UNSIGNED NULL AFTER reject_reason'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND COLUMN_NAME = 'transfer_charge_due_at'),
    'SELECT 1',
    'ALTER TABLE `TenantRequest` ADD COLUMN `transfer_charge_due_at` DATETIME NULL AFTER transfer_charge_payment_id'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND COLUMN_NAME = 'transfer_charge_periods'),
    'SELECT 1',
    'ALTER TABLE `TenantRequest` ADD COLUMN `transfer_charge_periods` INT UNSIGNED NULL AFTER transfer_charge_due_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND COLUMN_NAME = 'transfer_calc_date'),
    'SELECT 1',
    'ALTER TABLE `TenantRequest` ADD COLUMN `transfer_calc_date` DATE NULL AFTER transfer_charge_periods'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

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
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND INDEX_NAME = 'idx_tenant_request_status'),
    'SELECT 1',
    'CREATE INDEX `idx_tenant_request_status` ON `TenantRequest` (status, created_at)'
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
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantRequest' AND INDEX_NAME = 'idx_tenant_request_type_status'),
    'SELECT 1',
    'CREATE INDEX `idx_tenant_request_type_status` ON `TenantRequest` (type, status, completed_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;
