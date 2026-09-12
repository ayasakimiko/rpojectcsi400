import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME = "projectcsi400",
} = process.env;

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

  const [tables] = await connection.query("SHOW TABLES;");
  console.log(`Database "${DB_NAME}" is ready. Tables:`);
  for (const row of tables) {
    console.log(" -", Object.values(row)[0]);
  }

  await connection.end();
}

main().catch((err) => {
  console.error("Failed to set up database:", err.message);
  process.exit(1);
});
