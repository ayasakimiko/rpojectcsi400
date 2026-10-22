-- Schema owned by the parcel service. Applied by Database/migrate.js.

CREATE TABLE IF NOT EXISTS Parcel (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    room_number INT UNSIGNED NOT NULL,
    customer_id INT UNSIGNED NULL,
    tracking_number VARCHAR(100),
    sender_name VARCHAR(100) NOT NULL DEFAULT 'พัสดุทั่วไป',
    description VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    staff_name VARCHAR(255),
    received_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_parcel_customer_room (customer_id, room_number),
    FOREIGN KEY (room_number) REFERENCES Room(room_number) ON UPDATE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES Customer(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ParcelPhoto (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    parcel_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (parcel_id) REFERENCES Parcel(id) ON DELETE CASCADE
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Parcel' AND COLUMN_NAME = 'customer_id'),
    'SELECT 1',
    'ALTER TABLE `Parcel` ADD COLUMN `customer_id` INT UNSIGNED NULL AFTER room_number'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

UPDATE Parcel p
     SET p.customer_id = (
       SELECT c.id FROM Customer c
       WHERE c.room_number = p.room_number AND c.is_suspended = FALSE
       ORDER BY c.id DESC
       LIMIT 1
     )
     WHERE p.customer_id IS NULL
       AND EXISTS (
         SELECT 1 FROM Customer c
         WHERE c.room_number = p.room_number AND c.is_suspended = FALSE
       );
