-- Schema owned by the maintenance service. Applied by Database/migrate.js.

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
