-- Schema owned by the owner service. Applied by Database/migrate.js.

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

CREATE TABLE IF NOT EXISTS AuditLog (
    id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    actor_id INT UNSIGNED NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    method VARCHAR(10) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    status_code SMALLINT UNSIGNED NOT NULL,
    ip_address VARCHAR(45) NULL,
    details TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_log_created_at (created_at, id),
    INDEX idx_audit_log_actor (actor_role, actor_id, created_at)
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AuditLog' AND COLUMN_NAME = 'details'),
    'SELECT 1',
    'ALTER TABLE `AuditLog` ADD COLUMN `details` TEXT NULL AFTER ip_address'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

UPDATE Customer c
  JOIN (SELECT CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(endpoint, '/', -2), '/', 1) AS UNSIGNED) AS customer_id,
               MAX(created_at) AS suspended_at
          FROM AuditLog
         WHERE method = 'PATCH' AND endpoint LIKE '/api/admin/customers/%/suspend'
           AND details LIKE '%["is_suspended",true]%'
         GROUP BY customer_id) s ON s.customer_id = c.id
   SET c.suspended_at = s.suspended_at
 WHERE c.is_suspended = TRUE AND c.suspended_at IS NULL;

UPDATE Booking b
  JOIN Customer c ON c.id = b.customer_id
   SET b.ended_at = c.suspended_at
 WHERE c.is_suspended = TRUE AND c.suspended_at IS NOT NULL
   AND b.ended_at IS NULL AND b.contract_completed_at IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS DormConfig (
    id INT PRIMARY KEY DEFAULT 1,
    dorm_name VARCHAR(255) NOT NULL DEFAULT 'หอพักใจ',
    promptpay_id VARCHAR(50) NULL,
    bank_name VARCHAR(100) NULL,
    bank_account_no VARCHAR(50) NULL,
    dorm_rules TEXT NULL,
    gate_close_time VARCHAR(5) NULL,
    caretaker_phone VARCHAR(20) NULL,
    technician_phone VARCHAR(20) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DormConfig' AND COLUMN_NAME = 'contract_rules'),
    'SELECT 1',
    'ALTER TABLE `DormConfig` ADD COLUMN `contract_rules` TEXT NULL AFTER `dorm_rules`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DormConfig' AND COLUMN_NAME = 'gate_close_time'),
    'SELECT 1',
    'ALTER TABLE `DormConfig` ADD COLUMN `gate_close_time` VARCHAR(5) NULL'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DormConfig' AND COLUMN_NAME = 'caretaker_phone'),
    'SELECT 1',
    'ALTER TABLE `DormConfig` ADD COLUMN `caretaker_phone` VARCHAR(20) NULL'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DormConfig' AND COLUMN_NAME = 'technician_phone'),
    'SELECT 1',
    'ALTER TABLE `DormConfig` ADD COLUMN `technician_phone` VARCHAR(20) NULL'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DormConfig' AND COLUMN_NAME = 'promptpay_id'),
    'SELECT 1',
    'ALTER TABLE `DormConfig` ADD COLUMN `promptpay_id` VARCHAR(50) NULL AFTER `dorm_name`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DormConfig' AND COLUMN_NAME = 'bank_name'),
    'SELECT 1',
    'ALTER TABLE `DormConfig` ADD COLUMN `bank_name` VARCHAR(100) NULL AFTER `promptpay_id`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DormConfig' AND COLUMN_NAME = 'bank_account_no'),
    'SELECT 1',
    'ALTER TABLE `DormConfig` ADD COLUMN `bank_account_no` VARCHAR(50) NULL AFTER `bank_name`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DormConfig' AND COLUMN_NAME = 'payment_test_mode'),
    'SELECT 1',
    'ALTER TABLE `DormConfig` ADD COLUMN `payment_test_mode` BOOLEAN NOT NULL DEFAULT FALSE'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DormConfig' AND COLUMN_NAME = 'slip_verify_mode'),
    'SELECT 1',
    'ALTER TABLE `DormConfig` ADD COLUMN `slip_verify_mode` VARCHAR(10) NOT NULL DEFAULT ''auto'''
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;
