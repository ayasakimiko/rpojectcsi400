-- Schema owned by the admin service. Applied by Database/migrate.js.

CREATE TABLE IF NOT EXISTS Announcement (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    tone VARCHAR(20) NOT NULL DEFAULT 'info',
    author_name VARCHAR(255),
    expires_at DATETIME NULL,
    photos LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS AnnouncementAcknowledgement (
    announcement_id INT NOT NULL,
    customer_id INT UNSIGNED NOT NULL,
    acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (announcement_id, customer_id),
    INDEX idx_announcement_ack_customer (customer_id),
    FOREIGN KEY (announcement_id) REFERENCES Announcement(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES Customer(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS WaitingList (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    room_preference VARCHAR(100),
    note VARCHAR(500),
    desired_move_in_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    submitted_by_name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Announcement' AND COLUMN_NAME = 'expires_at'),
    'SELECT 1',
    'ALTER TABLE `Announcement` ADD COLUMN `expires_at` DATETIME NULL AFTER author_name'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Announcement' AND COLUMN_NAME = 'photos'),
    'SELECT 1',
    'ALTER TABLE `Announcement` ADD COLUMN `photos` LONGTEXT NULL AFTER expires_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Announcement' AND COLUMN_NAME = 'popup_until'),
    'SELECT 1',
    'ALTER TABLE `Announcement` ADD COLUMN `popup_until` DATETIME NULL AFTER expires_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WaitingList' AND COLUMN_NAME = 'desired_move_in_date'),
    'SELECT 1',
    'ALTER TABLE `WaitingList` ADD COLUMN `desired_move_in_date` DATE NULL AFTER note'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Announcement' AND INDEX_NAME = 'idx_announcement_expires'),
    'SELECT 1',
    'CREATE INDEX `idx_announcement_expires` ON `Announcement` (expires_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WaitingList' AND INDEX_NAME = 'idx_waiting_list_created'),
    'SELECT 1',
    'CREATE INDEX `idx_waiting_list_created` ON `WaitingList` (created_at)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;
