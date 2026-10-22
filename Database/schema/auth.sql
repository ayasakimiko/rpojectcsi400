-- Schema owned by the auth service. Applied by Database/migrate.js.

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
    dorm_info_acknowledged_at DATETIME NULL,
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
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND COLUMN_NAME = 'contract_duration_months'),
    'SELECT 1',
    'ALTER TABLE `Booking` ADD COLUMN `contract_duration_months` INT UNSIGNED NULL AFTER rental_end_date'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND COLUMN_NAME = 'contract_completed_at'),
    'SELECT 1',
    'ALTER TABLE `Booking` ADD COLUMN `contract_completed_at` DATETIME NULL AFTER contract_duration_months'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND COLUMN_NAME = 'ended_at'),
    'SELECT 1',
    'ALTER TABLE `Booking` ADD COLUMN `ended_at` DATETIME NULL AFTER contract_completed_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND COLUMN_NAME = 'deposit_amount'),
    'SELECT 1',
    'ALTER TABLE `Booking` ADD COLUMN `deposit_amount` DECIMAL(10,2) NULL AFTER ended_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

CREATE TABLE IF NOT EXISTS ContractImage (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    booking_id INT NOT NULL,
    customer_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NULL,
    url VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_contract_image_booking FOREIGN KEY (booking_id) REFERENCES Booking(id),
    CONSTRAINT fk_contract_image_customer FOREIGN KEY (customer_id) REFERENCES Customer(id),
    INDEX idx_contract_image_booking (booking_id, id),
    INDEX idx_contract_image_customer (customer_id)
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND INDEX_NAME = 'idx_booking_contract_completed'),
    'SELECT 1',
    'CREATE INDEX `idx_booking_contract_completed` ON `Booking` (contract_completed_at)'
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
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Customer' AND COLUMN_NAME = 'dorm_info_acknowledged_at'),
    'SELECT 1',
    'ALTER TABLE `Customer` ADD COLUMN `dorm_info_acknowledged_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP AFTER deposit_amount'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

ALTER TABLE `Customer` ALTER COLUMN `dorm_info_acknowledged_at` SET DEFAULT NULL;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Customer' AND COLUMN_NAME = 'history_reset_at'),
    'SELECT 1',
    'ALTER TABLE `Customer` ADD COLUMN `history_reset_at` DATETIME NULL AFTER dorm_info_acknowledged_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

UPDATE `Customer` SET `history_reset_at` = NOW() WHERE `is_suspended` = TRUE AND `history_reset_at` IS NULL;
