-- Schema owned by the market service. Applied by Database/migrate.js.
-- The market database is isolated: no views or foreign keys cross into the dorm databases.

CREATE TABLE IF NOT EXISTS MarketConfig (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    site_name VARCHAR(100) NOT NULL DEFAULT 'ร้านเช่าใต้ตึก',
    currency CHAR(3) NOT NULL DEFAULT 'THB',
    open_time TIME NOT NULL DEFAULT '07:00:00',
    close_time TIME NOT NULL DEFAULT '21:00:00',
    electricity_unit_price DECIMAL(10,2) NOT NULL DEFAULT 8.00,
    electricity_flat_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    water_unit_price DECIMAL(10,2) NOT NULL DEFAULT 18.00,
    water_flat_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    default_deposit_months TINYINT UNSIGNED NOT NULL DEFAULT 2,
    min_lease_months TINYINT UNSIGNED NOT NULL DEFAULT 6,
    contract_min_images TINYINT UNSIGNED NOT NULL DEFAULT 2,
    contract_terms TEXT NULL,
    default_rate_limit_per_min SMALLINT UNSIGNED NOT NULL DEFAULT 60,
    key_default_expiry_days SMALLINT UNSIGNED NOT NULL DEFAULT 180,
    key_rotation_grace_hours SMALLINT UNSIGNED NOT NULL DEFAULT 24,
    log_retention_days SMALLINT UNSIGNED NOT NULL DEFAULT 90,
    low_stock_percent TINYINT UNSIGNED NOT NULL DEFAULT 20,
    max_price_change_percent TINYINT UNSIGNED NULL,
    key_expiry_warning_days SMALLINT UNSIGNED NOT NULL DEFAULT 14,
    invoice_due_day TINYINT UNSIGNED NOT NULL DEFAULT 5,
    lease_expiry_warning_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    price_change_notice_days SMALLINT UNSIGNED NOT NULL DEFAULT 7,
    seeded_at DATETIME NULL,
    updated_at DATETIME NULL,
    CHECK (id = 1),
    CHECK (electricity_unit_price >= 0 AND electricity_flat_price >= 0 AND water_unit_price >= 0 AND water_flat_price >= 0),
    CHECK (default_deposit_months <= 12 AND min_lease_months BETWEEN 1 AND 60 AND contract_min_images BETWEEN 1 AND 10),
    CHECK (default_rate_limit_per_min BETWEEN 1 AND 6000 AND key_default_expiry_days BETWEEN 1 AND 3650),
    CHECK (key_rotation_grace_hours <= 720 AND log_retention_days BETWEEN 1 AND 3650 AND low_stock_percent <= 100),
    CHECK (max_price_change_percent IS NULL OR max_price_change_percent BETWEEN 1 AND 100)
);

INSERT IGNORE INTO MarketConfig (id, contract_terms) VALUES (1, CONCAT_WS('\n',
    '1. ผู้เช่าใช้พื้นที่ตามประเภทร้านที่ระบุในสัญญาเท่านั้น',
    '2. ชำระค่าเช่าภายในวันที่ 5 ของทุกเดือน ค่าไฟและค่าน้ำคิดตามมิเตอร์หรืออัตราที่ระบุในสัญญา',
    '3. ห้ามวางสินค้าหรืออุปกรณ์บนทางเท้าหน้าร้านและทางเดินหลังร้าน',
    '4. ร้านอาหารต้องล้างบ่อดักไขมันทุกเดือน และเก็บขยะไปที่ห้องขยะก่อนปิดร้าน',
    '5. ห้ามตั้งถังแก๊สในอาคาร การใช้แก๊สต้องได้รับอนุญาตเป็นลายลักษณ์อักษร',
    '6. แจ้งยกเลิกสัญญาล่วงหน้าอย่างน้อย 30 วัน เงินประกันคืนหลังหักค่าเสียหายและยอดค้างชำระ'
));

CREATE TABLE IF NOT EXISTS MarketStall (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    code VARCHAR(20) NOT NULL,
    unit_kind ENUM('rentable', 'common') NOT NULL DEFAULT 'rentable',
    zone VARCHAR(100) NULL,
    shop_name VARCHAR(100) NULL,
    map_row TINYINT UNSIGNED NOT NULL,
    map_col TINYINT UNSIGNED NOT NULL,
    width_m DECIMAL(5,2) NOT NULL,
    depth_m DECIMAL(5,2) NOT NULL,
    has_water BOOLEAN NOT NULL DEFAULT FALSE,
    has_grease_trap BOOLEAN NOT NULL DEFAULT FALSE,
    has_exhaust BOOLEAN NOT NULL DEFAULT FALSE,
    power_amp SMALLINT UNSIGNED NOT NULL DEFAULT 15,
    electricity_mode ENUM('included', 'flat', 'meter') NOT NULL DEFAULT 'meter',
    water_mode ENUM('included', 'flat', 'meter') NOT NULL DEFAULT 'meter',
    rent_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status ENUM('available', 'reserved', 'occupied', 'closed') NOT NULL DEFAULT 'closed',
    is_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
    note VARCHAR(500) NULL,
    created_by_role VARCHAR(20) NULL,
    created_by_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    UNIQUE KEY uq_market_stall_code (code),
    UNIQUE KEY uq_market_stall_position (is_sandbox, map_row, map_col),
    CHECK (width_m > 0 AND depth_m > 0),
    CHECK (rent_price >= 0),
    CHECK (power_amp BETWEEN 1 AND 400)
);

CREATE TABLE IF NOT EXISTS MarketCategory (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    requires_water BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_market_category_name (name)
);

CREATE TABLE IF NOT EXISTS MarketStallCategory (
    stall_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (stall_id, category_id),
    FOREIGN KEY (stall_id) REFERENCES MarketStall (id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES MarketCategory (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MarketProduct (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    stall_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 0,
    quantity_limit INT UNSIGNED NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    updated_by_role VARCHAR(20) NULL,
    updated_by_client_id INT UNSIGNED NULL,
    updated_by_name VARCHAR(255) NULL,
    updated_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_market_product_stall (stall_id, id),
    FOREIGN KEY (stall_id) REFERENCES MarketStall (id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES MarketCategory (id),
    CHECK (price >= 0),
    CHECK (quantity <= quantity_limit)
);

CREATE TABLE IF NOT EXISTS MarketVendor (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    vendor_name VARCHAR(100) NOT NULL,
    contact_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NULL,
    id_card_or_tax_id VARCHAR(20) NOT NULL,
    address VARCHAR(500) NULL,
    status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    UNIQUE KEY uq_market_vendor_tax_id (id_card_or_tax_id)
);

CREATE TABLE IF NOT EXISTS MarketBooking (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    stall_id INT UNSIGNED NOT NULL,
    vendor_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    lease_months TINYINT UNSIGNED NOT NULL,
    rent_price DECIMAL(10,2) NOT NULL,
    rent_total DECIMAL(12,2) NOT NULL,
    deposit_months TINYINT UNSIGNED NOT NULL,
    deposit_amount DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    note VARCHAR(500) NULL,
    status ENUM('pending', 'approved', 'rejected', 'cancelled', 'ended') NOT NULL DEFAULT 'pending',
    created_by_name VARCHAR(255) NULL,
    reviewed_by_role VARCHAR(20) NULL,
    reviewed_by_name VARCHAR(255) NULL,
    reviewed_at DATETIME NULL,
    reject_reason VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_market_booking_stall (stall_id, status, start_date, end_date),
    INDEX idx_market_booking_status (status, id),
    FOREIGN KEY (stall_id) REFERENCES MarketStall (id),
    FOREIGN KEY (vendor_id) REFERENCES MarketVendor (id),
    FOREIGN KEY (category_id) REFERENCES MarketCategory (id),
    CHECK (end_date > start_date),
    CHECK (lease_months BETWEEN 1 AND 60),
    CHECK (rent_price >= 0 AND rent_total >= 0 AND deposit_amount >= 0 AND total_price >= 0)
);

-- Shop lease contracts are their own contract type, kept apart from the room
-- rental contracts in the auth database (Booking / ContractImage).
CREATE TABLE IF NOT EXISTS MarketLeaseContract (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    contract_no VARCHAR(30) NOT NULL,
    contract_type ENUM('restaurant', 'retail') NOT NULL,
    booking_id INT UNSIGNED NOT NULL,
    stall_id INT UNSIGNED NOT NULL,
    vendor_id INT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    lease_months TINYINT UNSIGNED NOT NULL,
    rent_price DECIMAL(10,2) NOT NULL,
    deposit_months TINYINT UNSIGNED NOT NULL,
    deposit_amount DECIMAL(12,2) NOT NULL,
    electricity_mode ENUM('included', 'flat', 'meter') NOT NULL,
    water_mode ENUM('included', 'flat', 'meter') NOT NULL,
    terms TEXT NOT NULL,
    status ENUM('awaiting_signature', 'active', 'ended', 'terminated') NOT NULL DEFAULT 'awaiting_signature',
    signed_at DATETIME NULL,
    ended_at DATETIME NULL,
    end_reason VARCHAR(500) NULL,
    deposit_status ENUM('held', 'refunded', 'forfeited') NOT NULL DEFAULT 'held',
    deposit_deduction DECIMAL(12,2) NULL,
    deposit_refunded DECIMAL(12,2) NULL,
    deposit_note VARCHAR(500) NULL,
    deposit_settled_by VARCHAR(255) NULL,
    deposit_settled_at DATETIME NULL,
    created_by_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    UNIQUE KEY uq_market_lease_contract_no (contract_no),
    UNIQUE KEY uq_market_lease_booking (booking_id),
    INDEX idx_market_lease_status (status, id),
    FOREIGN KEY (booking_id) REFERENCES MarketBooking (id),
    FOREIGN KEY (stall_id) REFERENCES MarketStall (id),
    FOREIGN KEY (vendor_id) REFERENCES MarketVendor (id),
    CHECK (end_date > start_date),
    CHECK (deposit_deduction IS NULL OR deposit_deduction >= 0),
    CHECK (deposit_refunded IS NULL OR deposit_refunded >= 0)
);

CREATE TABLE IF NOT EXISTS MarketContractImage (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    contract_id INT UNSIGNED NOT NULL,
    file_name VARCHAR(100) NOT NULL,
    mime_type VARCHAR(30) NOT NULL,
    uploaded_by_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_market_contract_image (contract_id, id),
    FOREIGN KEY (contract_id) REFERENCES MarketLeaseContract (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MarketInvoice (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    contract_id INT UNSIGNED NOT NULL,
    period_month CHAR(7) NOT NULL,
    rent_amount DECIMAL(12,2) NOT NULL,
    electricity_units DECIMAL(10,2) NULL,
    electricity_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    water_units DECIMAL(10,2) NULL,
    water_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(12,2) NOT NULL,
    due_date DATE NULL,
    status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
    paid_at DATETIME NULL,
    paid_note VARCHAR(255) NULL,
    created_by_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_market_invoice_period (contract_id, period_month),
    FOREIGN KEY (contract_id) REFERENCES MarketLeaseContract (id) ON DELETE CASCADE,
    CHECK (rent_amount >= 0 AND electricity_total >= 0 AND water_total >= 0 AND total_amount >= 0)
);

CREATE TABLE IF NOT EXISTS MarketApiClient (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    project_name VARCHAR(100) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    mode ENUM('live', 'test') NOT NULL DEFAULT 'test',
    scopes TEXT NOT NULL,
    key_prefix CHAR(16) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    previous_key_prefix CHAR(16) NULL,
    previous_key_hash CHAR(64) NULL,
    previous_key_expires_at DATETIME NULL,
    allowed_ips TEXT NULL,
    rate_limit_per_min SMALLINT UNSIGNED NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at DATETIME NULL,
    last_used_at DATETIME NULL,
    created_by_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    UNIQUE KEY uq_market_api_client_prefix (key_prefix),
    INDEX idx_market_api_client_previous (previous_key_prefix),
    CHECK (rate_limit_per_min BETWEEN 1 AND 6000)
);

CREATE TABLE IF NOT EXISTS MarketApiClientStall (
    client_id INT UNSIGNED NOT NULL,
    stall_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (client_id, stall_id),
    FOREIGN KEY (client_id) REFERENCES MarketApiClient (id) ON DELETE CASCADE,
    FOREIGN KEY (stall_id) REFERENCES MarketStall (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MarketAllowedOrigin (
    id INT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    origin VARCHAR(255) NOT NULL,
    note VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_role VARCHAR(20) NULL,
    created_by_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    UNIQUE KEY uq_market_allowed_origin (origin)
);

CREATE TABLE IF NOT EXISTS MarketApiClientOrigin (
    client_id INT UNSIGNED NOT NULL,
    origin_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (client_id, origin_id),
    FOREIGN KEY (client_id) REFERENCES MarketApiClient (id) ON DELETE CASCADE,
    FOREIGN KEY (origin_id) REFERENCES MarketAllowedOrigin (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS MarketApiLog (
    id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    client_id INT UNSIGNED NULL,
    request_id CHAR(36) NOT NULL,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(255) NOT NULL,
    status_code SMALLINT UNSIGNED NOT NULL,
    ip VARCHAR(45) NULL,
    changes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_market_api_log_client (client_id, id),
    INDEX idx_market_api_log_created (created_at)
);

CREATE TABLE IF NOT EXISTS MarketAuditLog (
    id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL PRIMARY KEY,
    actor_role VARCHAR(20) NOT NULL,
    actor_id INT NULL,
    actor_name VARCHAR(255) NULL,
    action VARCHAR(60) NOT NULL,
    target VARCHAR(100) NULL,
    details TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_market_audit_created (created_at, id)
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MarketConfig' AND COLUMN_NAME = 'invoice_due_day'),
    'SELECT 1',
    'ALTER TABLE `MarketConfig` ADD COLUMN `invoice_due_day` TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER `key_expiry_warning_days`, ADD COLUMN `lease_expiry_warning_days` SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER `invoice_due_day`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MarketInvoice' AND COLUMN_NAME = 'due_date'),
    'SELECT 1',
    'ALTER TABLE `MarketInvoice` ADD COLUMN `due_date` DATE NULL AFTER `total_amount`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

-- Starting layout under the dorm rooms, seeded once (MarketConfig.seeded_at), so
-- units the owner deletes later do not come back on the next migrate.
SET @market_seed = (SELECT seeded_at IS NULL FROM MarketConfig WHERE id = 1);

INSERT INTO MarketCategory (name, requires_water)
SELECT seed.name, seed.requires_water
FROM (
    SELECT 'อาหาร' AS name, TRUE AS requires_water
    UNION ALL SELECT 'เครื่องดื่ม', FALSE
    UNION ALL SELECT 'ของชำ', FALSE
    UNION ALL SELECT 'ของใช้', FALSE
    UNION ALL SELECT 'เสื้อผ้า', FALSE
    UNION ALL SELECT 'อื่น ๆ', FALSE
) seed
WHERE @market_seed AND NOT EXISTS (SELECT 1 FROM MarketCategory c WHERE c.name = seed.name);

INSERT INTO MarketStall (code, unit_kind, zone, shop_name, map_row, map_col, width_m, depth_m, has_water,
                         has_grease_trap, has_exhaust, power_amp, electricity_mode, water_mode, status, is_sandbox)
SELECT seed.code, seed.unit_kind, seed.zone, seed.shop_name, seed.map_row, seed.map_col, seed.width_m, seed.depth_m,
       seed.has_water, seed.has_grease_trap, seed.has_exhaust, seed.power_amp, seed.electricity_mode, seed.water_mode,
       seed.status, seed.is_sandbox
FROM (
    SELECT 'R-01' AS code, 'rentable' AS unit_kind, 'ร้านอาหาร' AS zone, NULL AS shop_name, 1 AS map_row, 1 AS map_col,
           6.00 AS width_m, 8.00 AS depth_m, TRUE AS has_water, TRUE AS has_grease_trap, TRUE AS has_exhaust,
           30 AS power_amp, 'meter' AS electricity_mode, 'meter' AS water_mode, 'closed' AS status, FALSE AS is_sandbox
    UNION ALL SELECT 'R-02', 'rentable', 'ร้านอาหาร', NULL, 1, 2, 6.00, 8.00, TRUE, TRUE, TRUE, 30, 'meter', 'meter', 'closed', FALSE
    UNION ALL SELECT 'LOBBY', 'common', 'ส่วนกลาง', 'ล็อบบี้หอพัก', 1, 3, 4.00, 8.00, FALSE, FALSE, FALSE, 15, 'included', 'included', 'closed', FALSE
    UNION ALL SELECT 'S-01', 'rentable', 'ร้านค้า', NULL, 1, 4, 4.00, 8.00, FALSE, FALSE, FALSE, 15, 'meter', 'included', 'closed', FALSE
    UNION ALL SELECT 'S-02', 'rentable', 'ร้านค้า', NULL, 1, 5, 4.00, 8.00, FALSE, FALSE, FALSE, 15, 'meter', 'included', 'closed', FALSE
    UNION ALL SELECT 'S-03', 'rentable', 'ร้านค้า', NULL, 1, 6, 4.00, 8.00, FALSE, FALSE, FALSE, 15, 'meter', 'included', 'closed', FALSE
    UNION ALL SELECT 'T-01', 'rentable', 'ทดสอบ API', 'ร้านทดลอง 1', 1, 1, 4.00, 8.00, TRUE, FALSE, FALSE, 15, 'included', 'included', 'occupied', TRUE
    UNION ALL SELECT 'T-02', 'rentable', 'ทดสอบ API', 'ร้านทดลอง 2', 1, 2, 4.00, 8.00, FALSE, FALSE, FALSE, 15, 'included', 'included', 'occupied', TRUE
) seed
WHERE @market_seed AND NOT EXISTS (SELECT 1 FROM MarketStall s WHERE s.code = seed.code);

INSERT IGNORE INTO MarketStallCategory (stall_id, category_id)
SELECT s.id, c.id
FROM MarketStall s
JOIN MarketCategory c ON (
    (s.code IN ('R-01', 'R-02', 'T-01') AND c.name IN ('อาหาร', 'เครื่องดื่ม'))
    OR (s.code IN ('S-01', 'S-02', 'S-03', 'T-02') AND c.name IN ('เครื่องดื่ม', 'ของชำ', 'ของใช้', 'เสื้อผ้า', 'อื่น ๆ'))
)
WHERE @market_seed;

INSERT INTO MarketProduct (stall_id, category_id, name, unit, price, quantity, quantity_limit, updated_by_role, updated_at)
SELECT s.id, c.id, seed.name, seed.unit, seed.price, seed.quantity, seed.quantity_limit, 'seed', NOW()
FROM (
    SELECT 'T-01' AS code, 'อาหาร' AS category, 'ข้าวผัดทดสอบ' AS name, 'จาน' AS unit, 50.00 AS price, 10 AS quantity, 30 AS quantity_limit
    UNION ALL SELECT 'T-01', 'เครื่องดื่ม', 'ชาเย็นทดสอบ', 'แก้ว', 30.00, 5, 20
    UNION ALL SELECT 'T-02', 'ของชำ', 'น้ำดื่มทดสอบ', 'ขวด', 10.00, 24, 48
) seed
JOIN MarketStall s ON s.code = seed.code AND s.is_sandbox = TRUE
JOIN MarketCategory c ON c.name = seed.category
WHERE @market_seed;

UPDATE MarketConfig SET seeded_at = NOW() WHERE id = 1 AND seeded_at IS NULL;
