import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME = "projectcsi400",
} = process.env;

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

async function seedDefaults(connection) {
  const [[{ count: staffCount }]] = await connection.query(
    "SELECT COUNT(*) AS count FROM Staff"
  );
  if (staffCount === 0) {
    const defaultIdcard = process.env.DEFAULT_STAFF_IDCARD || "1100200000101";
    const defaultPassword = process.env.DEFAULT_STAFF_PASSWORD || "test1234";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    await connection.query(
      `INSERT INTO Staff (role, idcard, password, phone, first_name, last_name, is_suspended, age)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["Staff", defaultIdcard, hashedPassword, "0800000000", "พนักงาน", "เริ่มต้น", false, 25]
    );
    console.log(
      `Seeded default staff (idcard: ${defaultIdcard}, password: ${defaultPassword})`
    );
  }

  const [[{ count: adminCount }]] = await connection.query(
    "SELECT COUNT(*) AS count FROM Admin"
  );
  if (adminCount === 0) {
    const defaultIdcard = process.env.DEFAULT_ADMIN_IDCARD || "1100200000201";
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "test1234";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    await connection.query(
      `INSERT INTO Admin (role, idcard, password, phone, first_name, last_name, is_suspended, age)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["Admin", defaultIdcard, hashedPassword, "0800000001", "แอดมิน", "เริ่มต้น", false, 25]
    );
    console.log(
      `Seeded default admin (idcard: ${defaultIdcard}, password: ${defaultPassword})`
    );
  }

  const [[{ count: ownerCount }]] = await connection.query(
    "SELECT COUNT(*) AS count FROM Owner"
  );
  if (ownerCount === 0) {
    const defaultIdcard = process.env.DEFAULT_OWNER_IDCARD || "1100200000301";
    const defaultPassword = process.env.DEFAULT_OWNER_PASSWORD || "test1234";
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    await connection.query(
      `INSERT INTO Owner (role, idcard, password, phone, first_name, last_name, is_suspended, age)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ["Owner", defaultIdcard, hashedPassword, "0800000002", "เจ้าของ", "หอพัก", false, 45]
    );
    console.log(
      `Seeded default owner (idcard: ${defaultIdcard}, password: ${defaultPassword})`
    );
  }

  const [[{ count: roomCount }]] = await connection.query(
    "SELECT COUNT(*) AS count FROM Room"
  );
  if (roomCount === 0) {
    await connection.query(
      `INSERT INTO Room
        (room_number, is_booked, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_price)
       VALUES
        (101, FALSE, 3000.00, TRUE, TRUE, TRUE, 1, TRUE, TRUE, 8.00, 100.00),
        (102, FALSE, 3200.00, TRUE, TRUE, TRUE, 1, TRUE, TRUE, 8.00, 100.00),
        (103, FALSE, 3500.00, TRUE, TRUE, TRUE, 2, TRUE, TRUE, 8.00, 100.00),
        (104, FALSE, 3800.00, TRUE, TRUE, TRUE, 2, TRUE, TRUE, 8.00, 100.00),
        (105, FALSE, 4000.00, TRUE, TRUE, TRUE, 2, TRUE, TRUE, 8.00, 100.00)`
    );
    console.log("Seeded 5 default rooms (101-105)");
  }
}

async function ensureColumn(connection, table, column, definition) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, table, column],
  );
  if (rows.length === 0) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`Added column ${table}.${column}`);
  }
}

async function ensureIndex(connection, table, index, definition) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [DB_NAME, table, index],
  );
  if (rows.length === 0) {
    await connection.query(`ALTER TABLE \`${table}\` ADD ${definition}`);
    console.log(`Added index ${table}.${index}`);
  }
}

async function main() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await connection.changeUser({ database: DB_NAME });

  const sql = fs.readFileSync(path.join(__dirname, "database.sql"), "utf8");
  await connection.query(sql);
  await ensureColumn(connection, "Announcement", "expires_at", "DATETIME NULL AFTER author_name");
  await ensureColumn(connection, "Parcel", "customer_id", "INT UNSIGNED NULL AFTER room_number");
  await ensureColumn(connection, "TenantRequest", "target_room_number", "INT UNSIGNED NULL AFTER room_number");
  await ensureColumn(connection, "Booking", "rental_start_date", "DATETIME NULL AFTER room_id");
  await ensureColumn(connection, "Booking", "rental_end_date", "DATETIME NULL AFTER rental_start_date");
  await ensureColumn(connection, "MoveOutInspection", "tenant_request_id", "INT NULL AFTER room_number");
  await ensureColumn(connection, "MoveOutInspection", "updated_at", "DATETIME NULL AFTER reviewed_at");
  await ensureIndex(connection, "MoveOutInspection", "uq_move_out_inspection_tenant_request", "UNIQUE INDEX `uq_move_out_inspection_tenant_request` (`tenant_request_id`)");
  await connection.query(
    `UPDATE TenantRequest tr
     JOIN MoveOutInspection moi ON moi.tenant_request_id = tr.id
     SET tr.status = CASE WHEN tr.status = 'pending' THEN 'in_progress' ELSE tr.status END,
         tr.accepted_at = COALESCE(tr.accepted_at, moi.created_at),
         tr.accepted_by_name = COALESCE(tr.accepted_by_name, moi.inspected_by_name)
     WHERE tr.type = 'move_room'
       AND tr.status IN ('pending', 'in_progress')
       AND (tr.status = 'pending' OR tr.accepted_at IS NULL OR tr.accepted_by_name IS NULL)`,
  );
  await connection.query(
    `UPDATE Parcel p
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
       )`,
  );

  await seedDefaults(connection);

  const [tables] = await connection.query("SHOW TABLES;");
  console.log(`Database "${DB_NAME}" is ready. Tables:`);
  for (const row of tables) {
    console.log(" -", Object.values(row)[0]);
  }

  await connection.end();
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error("Failed to set up database:", err.message);
    process.exit(1);
  });
}
