import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { DB_CONFIG } from "./connection.js";
import { savePublicImages } from "../middleware/publicUploads.js";

const PHOTO_BATCH_SIZE = 20;

async function applySchema(connection) {
  const sql = await readFile(new URL("./database.sql", import.meta.url), "utf8");
  await connection.query(
    "CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    [DB_CONFIG.database],
  );
  await connection.changeUser({ database: DB_CONFIG.database });
  await connection.query(sql);
}

async function moveMaintenancePhotosToFiles(connection) {
  let moved = 0;
  for (;;) {
    const [rows] = await connection.query(
      `SELECT id, name, data_url FROM MaintenancePhoto
       WHERE url IS NULL AND data_url IS NOT NULL ORDER BY id ASC LIMIT ?`,
      [PHOTO_BATCH_SIZE],
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      let url = null;
      try {
        [{ url }] = await savePublicImages("maintenance", [{ name: row.name, dataUrl: row.data_url }]);
      } catch (error) {
        if (error.message !== "Invalid image data") throw error;
        console.warn(`Skip maintenance photo ${row.id}: invalid image data`);
      }
      await connection.query("UPDATE MaintenancePhoto SET url = ?, data_url = NULL WHERE id = ?", [url, row.id]);
      if (url) moved += 1;
    }
  }
  if (moved > 0) await connection.query("OPTIMIZE TABLE MaintenancePhoto");
  return moved;
}

async function migrate() {
  const { database, ...serverConfig } = DB_CONFIG;
  const connection = await mysql.createConnection({ ...serverConfig, multipleStatements: true });
  const lockName = `schema:${createHash("sha256").update(database).digest("hex").slice(0, 40)}`;
  let locked = false;
  try {
    const [[{ acquired }]] = await connection.query("SELECT GET_LOCK(?, 120) AS acquired", [lockName]);
    if (acquired !== 1) throw new Error(`Could not acquire schema lock for database "${database}"`);
    locked = true;
    await applySchema(connection);
    const moved = await moveMaintenancePhotosToFiles(connection);
    console.log(`Database "${database}" schema is ready.${moved ? ` Moved ${moved} maintenance photos to files.` : ""}`);
  } finally {
    try {
      if (locked) await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    } finally {
      await connection.end();
    }
  }
}

migrate().catch((error) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
