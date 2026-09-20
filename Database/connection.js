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
