CREATE TABLE IF NOT EXISTS Shop (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    shop_type VARCHAR(100) NOT NULL,
    location VARCHAR(255) NOT NULL,
    area_sqm DECIMAL(7,2) NOT NULL DEFAULT 0,
    monthly_rent DECIMAL(10,2) NOT NULL DEFAULT 0,
    open_time TIME NULL,
    close_time TIME NULL,
    description VARCHAR(1000) NULL,
    caretaker_staff_id INT NULL,
    caretaker_name VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_role VARCHAR(20) NOT NULL,
    created_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ShopLease (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    contract_no VARCHAR(30) NOT NULL UNIQUE,
    shop_id INT NOT NULL,
    tenant_name VARCHAR(255) NOT NULL,
    tenant_phone VARCHAR(20) NOT NULL,
    tenant_idcard VARCHAR(13) NOT NULL,
    tenant_email VARCHAR(255) NULL,
    business_name VARCHAR(150) NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    monthly_rent DECIMAL(10,2) NOT NULL,
    deposit DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_due_day TINYINT UNSIGNED NOT NULL DEFAULT 5,
    terms VARCHAR(2000) NULL,
    status ENUM('active', 'terminated') NOT NULL DEFAULT 'active',
    terminated_at DATETIME NULL,
    termination_reason VARCHAR(500) NULL,
    terminated_by_name VARCHAR(255) NULL,
    created_by_role VARCHAR(20) NOT NULL,
    created_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_shop_lease_shop_dates (shop_id, status, start_date, end_date),
    FOREIGN KEY (shop_id) REFERENCES Shop(id)
);

CREATE TABLE IF NOT EXISTS ShopProduct (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    shop_id INT NOT NULL,
    sku VARCHAR(40) NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INT UNSIGNED NOT NULL DEFAULT 0,
    unit VARCHAR(30) NOT NULL DEFAULT 'ชิ้น',
    description VARCHAR(500) NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_shop_product_sku (shop_id, sku),
    INDEX idx_shop_product_category (shop_id, category),
    FOREIGN KEY (shop_id) REFERENCES Shop(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ShopApiKey (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    lease_id INT NOT NULL,
    label VARCHAR(100) NOT NULL,
    key_prefix CHAR(14) NOT NULL UNIQUE,
    key_hash CHAR(64) NOT NULL,
    created_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME NULL,
    revoked_at DATETIME NULL,
    revoked_by_name VARCHAR(255) NULL,

    INDEX idx_shop_api_key_lease (lease_id),
    FOREIGN KEY (lease_id) REFERENCES ShopLease(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ShopLeaseImage (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    lease_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    file_name VARCHAR(64) NOT NULL UNIQUE,
    uploaded_by_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_shop_lease_image_lease (lease_id),
    FOREIGN KEY (lease_id) REFERENCES ShopLease(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ShopLeasePayment (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    lease_id INT NOT NULL,
    payment_type ENUM('initial', 'renewal') NOT NULL DEFAULT 'initial',
    amount DECIMAL(10,2) NOT NULL,
    rent_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    deposit_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    method ENUM('promptpay', 'bank', 'counter') NOT NULL,
    verify_mode ENUM('auto', 'manual', 'test', 'counter') NOT NULL,
    slip_file VARCHAR(64) NULL,
    qr_payload VARCHAR(255) NULL UNIQUE,
    trans_ref VARCHAR(64) NULL UNIQUE,
    payer_name VARCHAR(255) NULL,
    transferred_at DATETIME NULL,
    received_by_name VARCHAR(255) NOT NULL,
    paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_shop_lease_payment_lease (lease_id),
    FOREIGN KEY (lease_id) REFERENCES ShopLease(id) ON DELETE CASCADE
);

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopLeasePayment' AND COLUMN_NAME = 'renew_months'),
    'SELECT 1',
    'ALTER TABLE `ShopLeasePayment` ADD COLUMN `renew_months` TINYINT UNSIGNED NULL AFTER `deposit_amount`, ADD COLUMN `renew_plan` VARCHAR(20) NULL AFTER `renew_months`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

SET @schema_upgrade_sql = IF(
    EXISTS (SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopApiKey' AND COLUMN_NAME = 'key_cipher'),
    'SELECT 1',
    'ALTER TABLE `ShopApiKey` ADD COLUMN `key_cipher` VARCHAR(255) NULL AFTER `key_hash`'
);
PREPARE schema_upgrade FROM @schema_upgrade_sql;
EXECUTE schema_upgrade;
DEALLOCATE PREPARE schema_upgrade;

CREATE TABLE IF NOT EXISTS ShopSeed (
    name VARCHAR(50) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE VIEW ShopLeaseInfo AS
SELECT l.id, l.contract_no, l.shop_id, s.code AS shop_code, s.name AS shop_name, s.location AS shop_location,
       l.tenant_name, l.tenant_phone, l.tenant_idcard, l.tenant_email, l.business_name,
       DATE_FORMAT(l.start_date, '%Y-%m-%d') AS start_date, DATE_FORMAT(l.end_date, '%Y-%m-%d') AS end_date,
       l.monthly_rent, l.deposit, l.payment_due_day, l.terms, l.terminated_at, l.termination_reason, l.terminated_by_name,
       l.created_by_role, l.created_by_name, l.created_at,
       CASE
           WHEN l.status = 'terminated' THEN 'terminated'
           WHEN l.end_date < CURDATE() THEN 'expired'
           WHEN l.start_date > CURDATE() THEN 'upcoming'
           ELSE 'active'
       END AS status,
       (SELECT COUNT(*) FROM ShopApiKey k WHERE k.lease_id = l.id AND k.revoked_at IS NULL) AS active_keys
FROM ShopLease l
JOIN Shop s ON s.id = l.shop_id;

CREATE OR REPLACE VIEW ShopInfo AS
SELECT s.id, s.code, s.name, s.shop_type, s.location, s.area_sqm, s.monthly_rent,
       TIME_FORMAT(s.open_time, '%H:%i') AS open_time, TIME_FORMAT(s.close_time, '%H:%i') AS close_time,
       s.description, s.caretaker_staff_id, s.caretaker_name, s.created_by_role, s.created_by_name, s.created_at, s.updated_at,
       l.id AS lease_id, l.contract_no AS lease_contract_no, l.tenant_name AS lease_tenant_name,
       l.business_name AS lease_business_name, l.tenant_phone AS lease_tenant_phone,
       DATE_FORMAT(l.start_date, '%Y-%m-%d') AS lease_start_date, DATE_FORMAT(l.end_date, '%Y-%m-%d') AS lease_end_date,
       l.monthly_rent AS lease_monthly_rent,
       CASE WHEN l.id IS NULL THEN NULL WHEN l.start_date > CURDATE() THEN 'upcoming' ELSE 'active' END AS lease_status,
       (SELECT COUNT(*) FROM ShopProduct p WHERE p.shop_id = s.id) AS product_count,
       (SELECT COUNT(*) FROM ShopProduct p WHERE p.shop_id = s.id AND p.is_available = TRUE) AS available_count
FROM Shop s
LEFT JOIN ShopLease l ON l.id = (
    SELECT cl.id FROM ShopLease cl
    WHERE cl.shop_id = s.id AND cl.status = 'active' AND cl.end_date >= CURDATE()
    ORDER BY cl.start_date ASC
    LIMIT 1
)
WHERE s.is_active = TRUE;

INSERT INTO Shop (code, name, shop_type, location, area_sqm, monthly_rent, open_time, close_time, description, created_by_role, created_by_name)
SELECT seed.* FROM (
    SELECT 'SH-01' AS code, 'มินิมาร์ทหน้าหอ' AS name, 'มินิมาร์ท / ร้านสะดวกซื้อ' AS shop_type, 'ชั้น 1 ติดประตูทางเข้าหลัก' AS location, 24.00 AS area_sqm, 8500.00 AS monthly_rent, '06:00:00' AS open_time, '23:00:00' AS close_time, 'ร้านสะดวกซื้อขนาดเล็ก ขายเครื่องดื่ม ขนม อาหารพร้อมทาน และของใช้ประจำวัน' AS description, 'Admin' AS created_by_role, 'ระบบ (ข้อมูลตั้งต้น)' AS created_by_name
    UNION ALL SELECT 'SH-02', 'ร้านกาแฟและเครื่องดื่ม', 'ร้านเครื่องดื่ม', 'ลานหน้าหอ ฝั่งที่จอดรถ', 15.00, 6000.00, '07:00:00', '20:00:00', 'กาแฟสด ชา นม ปั่น และเบเกอรี่', 'Admin', 'ระบบ (ข้อมูลตั้งต้น)'
    UNION ALL SELECT 'SH-03', 'ร้านเครื่องเขียนและของใช้', 'เครื่องเขียน / ของใช้', 'ชั้น 1 ข้างห้องซักรีด', 12.00, 4500.00, '09:00:00', '21:00:00', 'เครื่องเขียน ถ่ายเอกสาร อุปกรณ์ไอที และของใช้ในห้องพัก', 'Admin', 'ระบบ (ข้อมูลตั้งต้น)'
) seed
WHERE NOT EXISTS (SELECT 1 FROM ShopSeed WHERE name = 'initial-shops');

INSERT INTO ShopLease (contract_no, shop_id, tenant_name, tenant_phone, tenant_idcard, business_name, start_date, end_date, monthly_rent, deposit, payment_due_day, terms, created_by_role, created_by_name)
SELECT seed.contract_no, s.id, seed.tenant_name, seed.tenant_phone, seed.tenant_idcard, seed.business_name,
       DATE_SUB(CURDATE(), INTERVAL seed.months_ago MONTH),
       DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 12 - seed.months_ago MONTH), INTERVAL 1 DAY),
       s.monthly_rent, s.monthly_rent * 2, 5, 'ชำระค่าเช่าภายในวันที่ 5 ของทุกเดือน วางมัดจำ 2 เดือน', 'Admin', 'ระบบ (ข้อมูลตั้งต้น)'
FROM (
    SELECT 'SL-SEED-0001' AS contract_no, 'SH-01' AS code, 'สมชาย ใจดี' AS tenant_name, '0812345601' AS tenant_phone, '1100100000011' AS tenant_idcard, 'สมชายมินิมาร์ท' AS business_name, 3 AS months_ago
    UNION ALL SELECT 'SL-SEED-0002', 'SH-02', 'มาลี รักกาแฟ', '0812345602', '1100100000022', 'Malee Coffee', 2
    UNION ALL SELECT 'SL-SEED-0003', 'SH-03', 'วิชัย ขยันเรียน', '0812345603', '1100100000033', 'วิชัยเครื่องเขียน', 1
) seed
JOIN Shop s ON s.code = seed.code
WHERE NOT EXISTS (SELECT 1 FROM ShopSeed WHERE name = 'initial-shops');

INSERT INTO ShopProduct (shop_id, sku, name, category, price, stock, unit, description, updated_by)
SELECT s.id, seed.sku, seed.name, seed.category, seed.price, seed.stock, seed.unit, seed.description, 'ระบบ (ข้อมูลตั้งต้น)'
FROM (
    SELECT 'SH-01' AS code, 'MM-001' AS sku, 'น้ำดื่ม 600 มล.' AS name, 'เครื่องดื่ม' AS category, 7.00 AS price, 120 AS stock, 'ขวด' AS unit, NULL AS description
    UNION ALL SELECT 'SH-01', 'MM-002', 'นมจืด UHT 200 มล.', 'เครื่องดื่ม', 13.00, 60, 'กล่อง', NULL
    UNION ALL SELECT 'SH-01', 'MM-003', 'บะหมี่กึ่งสำเร็จรูป', 'อาหารแห้ง', 7.00, 200, 'ซอง', NULL
    UNION ALL SELECT 'SH-01', 'MM-004', 'ข้าวกะเพราไก่ (อุ่นร้อน)', 'อาหารพร้อมทาน', 45.00, 15, 'กล่อง', 'อุ่นด้วยไมโครเวฟที่ร้านได้'
    UNION ALL SELECT 'SH-01', 'MM-005', 'ขนมมันฝรั่งทอด', 'ขนมขบเคี้ยว', 20.00, 48, 'ถุง', NULL
    UNION ALL SELECT 'SH-01', 'MM-006', 'ผงซักฟอก 800 ก.', 'ของใช้ประจำวัน', 59.00, 20, 'ถุง', NULL
    UNION ALL SELECT 'SH-01', 'MM-007', 'ยาสีฟัน 150 ก.', 'ของใช้ประจำวัน', 45.00, 25, 'หลอด', NULL
    UNION ALL SELECT 'SH-02', 'CF-001', 'อเมริกาโน่เย็น', 'กาแฟ', 45.00, 99, 'แก้ว', 'ชงสดตามสั่ง'
    UNION ALL SELECT 'SH-02', 'CF-002', 'ลาเต้เย็น', 'กาแฟ', 50.00, 99, 'แก้ว', 'ชงสดตามสั่ง'
    UNION ALL SELECT 'SH-02', 'CF-003', 'ชาไทยเย็น', 'ชา / นม', 40.00, 99, 'แก้ว', NULL
    UNION ALL SELECT 'SH-02', 'CF-004', 'โกโก้ปั่น', 'เครื่องดื่มปั่น', 55.00, 99, 'แก้ว', NULL
    UNION ALL SELECT 'SH-02', 'CF-005', 'ครัวซองต์เนยสด', 'เบเกอรี่', 35.00, 12, 'ชิ้น', NULL
    UNION ALL SELECT 'SH-03', 'ST-001', 'ปากกาลูกลื่น 0.5 มม.', 'เครื่องเขียน', 10.00, 150, 'ด้าม', NULL
    UNION ALL SELECT 'SH-03', 'ST-002', 'สมุดปกอ่อน 80 แผ่น', 'เครื่องเขียน', 25.00, 80, 'เล่ม', NULL
    UNION ALL SELECT 'SH-03', 'ST-003', 'ถ่ายเอกสาร A4', 'บริการ', 1.00, 999, 'แผ่น', 'ขาวดำ หน้าละ 1 บาท'
    UNION ALL SELECT 'SH-03', 'ST-004', 'สาย USB-C 1 ม.', 'อุปกรณ์ไอที', 89.00, 30, 'เส้น', NULL
    UNION ALL SELECT 'SH-03', 'ST-005', 'ไม้แขวนเสื้อ (แพ็ค 10)', 'ของใช้ในห้องพัก', 39.00, 40, 'แพ็ค', NULL
) seed
JOIN Shop s ON s.code = seed.code
WHERE NOT EXISTS (SELECT 1 FROM ShopSeed WHERE name = 'initial-shops');

INSERT IGNORE INTO ShopSeed (name) VALUES ('initial-shops');
