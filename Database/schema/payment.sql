-- Schema owned by the payment service. Applied by Database/migrate.js.

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
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Payment' AND INDEX_NAME = 'idx_payment_status_type_date'),
    'SELECT 1',
    'CREATE INDEX `idx_payment_status_type_date` ON `Payment` (status, type, payment_date)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Payment' AND INDEX_NAME = 'idx_payment_booking_date'),
    'SELECT 1',
    'CREATE INDEX `idx_payment_booking_date` ON `Payment` (booking_id, payment_date)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

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
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PaymentSlip' AND INDEX_NAME = 'idx_payment_slip_created'),
    'SELECT 1',
    'CREATE INDEX `idx_payment_slip_created` ON `PaymentSlip` (created_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

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
