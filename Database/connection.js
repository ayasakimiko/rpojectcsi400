import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import "dotenv/config";

const {
  DB_HOST = "localhost",
  DB_PORT = "3308",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME = "projectcsi400",
} = process.env;

async function initializeDatabase() {
  const sql = await readFile(new URL("./database.sql", import.meta.url), "utf8");
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  const lockName = `schema:${createHash("sha256").update(DB_NAME).digest("hex").slice(0, 40)}`;
  let locked = false;

  try {
    const [[{ acquired }]] = await connection.query(
      "SELECT GET_LOCK(?, 120) AS acquired",
      [lockName],
    );
    if (acquired !== 1) {
      throw new Error(`Could not acquire schema lock for database "${DB_NAME}"`);
    }
    locked = true;
    await connection.query(
      "CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      [DB_NAME],
    );
    await connection.changeUser({ database: DB_NAME });
    await connection.query(sql);
    console.log(`Database "${DB_NAME}" schema is ready.`);
  } finally {
    try {
      if (locked) {
        await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
      }
    } finally {
      await connection.end();
    }
  }
}

await initializeDatabase();

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
