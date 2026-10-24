-- Schema owned by the room service. Applied by Database/migrate.js.

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
    custom_amenities TEXT NULL,
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
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'water_unit_price'),
    'SELECT 1',
    'ALTER TABLE `Room` ADD COLUMN `water_unit_price` DECIMAL(10,2) NOT NULL DEFAULT 100.00 AFTER `electricity_unit_price`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'billing_start_date'),
    'SELECT 1',
    'ALTER TABLE `Room` ADD COLUMN `billing_start_date` DATETIME NULL AFTER `prepaid_until`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'rent_credit'),
    'SELECT 1',
    'ALTER TABLE `Room` ADD COLUMN `rent_credit` DECIMAL(10,2) NULL AFTER `pending_lump_sum_months`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'room_size'),
    'SELECT 1',
    'ALTER TABLE `Room` ADD COLUMN `room_size` DECIMAL(6,2) NULL AFTER `price`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'custom_amenities'),
    'SELECT 1',
    'ALTER TABLE `Room` ADD COLUMN `custom_amenities` TEXT NULL AFTER `cctv`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

-- Room types group rooms that share the same furnishings. `assets` is a JSON
-- list of { name, price } used as the default price list for move-in checks.
CREATE TABLE IF NOT EXISTS RoomType (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500) NULL,
    assets TEXT NOT NULL,
    updated_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'room_type_id'),
    'SELECT 1',
    'ALTER TABLE `Room` ADD COLUMN `room_type_id` INT NULL AFTER `room_size`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

-- A room's own asset list ({ name, price }); NULL means use its room type's list.
SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'assets'),
    'SELECT 1',
    'ALTER TABLE `Room` ADD COLUMN `assets` TEXT NULL AFTER `room_type_id`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

-- Simulated per-room Wi-Fi (test system, no real router). A room's settings are
-- created on first use from its `wifi` amenity flag; devices are added by staff.
CREATE TABLE IF NOT EXISTS RoomWifi (
    room_number INT UNSIGNED NOT NULL PRIMARY KEY,
    ssid VARCHAR(32) NOT NULL,
    password VARCHAR(63) NOT NULL,
    max_devices TINYINT UNSIGNED NOT NULL DEFAULT 3 CHECK (max_devices BETWEEN 1 AND 20),
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_number) REFERENCES Room (room_number) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS RoomWifiDevice (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    room_number INT UNSIGNED NOT NULL,
    device_name VARCHAR(60) NOT NULL,
    device_type ENUM('phone', 'laptop', 'tablet', 'tv', 'other') NOT NULL DEFAULT 'other',
    mac_address CHAR(17) NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT TRUE,
    connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_room_wifi_device_room (room_number),
    FOREIGN KEY (room_number) REFERENCES RoomWifi (room_number) ON DELETE CASCADE ON UPDATE CASCADE
);
