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
