-- Schema owned by the staff service. Applied by Database/migrate.js.

CREATE TABLE IF NOT EXISTS MoveOutInspection (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    room_number INT UNSIGNED NOT NULL,
    tenant_request_id INT NULL,
    tenant_name VARCHAR(255) NOT NULL,
    tenant_phone VARCHAR(20),
    checklist TEXT NOT NULL,
    damage_note VARCHAR(1000),
    photos LONGTEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    inspected_by_name VARCHAR(255),
    reviewed_at DATETIME NULL,
    updated_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX uq_move_out_inspection_tenant_request (tenant_request_id)
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection' AND COLUMN_NAME = 'tenant_request_id'),
    'SELECT 1',
    'ALTER TABLE `MoveOutInspection` ADD COLUMN `tenant_request_id` INT NULL AFTER room_number'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection' AND COLUMN_NAME = 'updated_at'),
    'SELECT 1',
    'ALTER TABLE `MoveOutInspection` ADD COLUMN `updated_at` DATETIME NULL AFTER reviewed_at'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection'
              AND COLUMN_NAME = 'tenant_request_id' AND NON_UNIQUE = 0
              AND INDEX_NAME IN (
                  SELECT INDEX_NAME FROM information_schema.STATISTICS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection'
                  GROUP BY INDEX_NAME HAVING COUNT(*) = 1
              )),
    'SELECT 1',
    'ALTER TABLE `MoveOutInspection` ADD UNIQUE INDEX `uq_move_out_inspection_tenant_request` (`tenant_request_id`)'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

UPDATE TenantRequest tr
     JOIN MoveOutInspection moi ON moi.tenant_request_id = tr.id
     SET tr.status = CASE WHEN tr.status = 'pending' THEN 'in_progress' ELSE tr.status END,
         tr.accepted_at = COALESCE(tr.accepted_at, moi.created_at),
         tr.accepted_by_name = COALESCE(tr.accepted_by_name, moi.inspected_by_name)
     WHERE tr.type = 'move_room'
       AND tr.status IN ('pending', 'in_progress')
       AND (tr.status = 'pending' OR tr.accepted_at IS NULL OR tr.accepted_by_name IS NULL);

-- Keep stale requests and their inspection links for audit, but remove them from active workflows.
UPDATE TenantRequest tr
     JOIN Customer c ON c.id = tr.customer_id
     SET tr.status = 'cancelled', tr.completed_at = NOW(),
         tr.completed_by_name = 'ระบบ (เปลี่ยนห้อง)'
     WHERE tr.status IN ('pending', 'in_progress')
       AND (c.room_number IS NULL OR tr.room_number <> c.room_number);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MoveOutInspection' AND COLUMN_NAME = 'hidden_at'),
    'SELECT 1',
    'ALTER TABLE `MoveOutInspection` ADD COLUMN `hidden_at` DATETIME NULL, ADD COLUMN `hidden_by_name` VARCHAR(255) NULL, ADD COLUMN `hidden_tenant_request_id` INT NULL'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;
