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
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Room' AND COLUMN_NAME = 'custom_amenities'),
    'SELECT 1',
    'ALTER TABLE `Room` ADD COLUMN `custom_amenities` TEXT NULL AFTER `cctv`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;
