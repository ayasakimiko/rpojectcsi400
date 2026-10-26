import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  DB_CONFIG,
  ISOLATED_SERVICES,
  SCHEMA_SERVICES,
  TABLE_OWNER,
  TABLES_BY_SERVICE,
  serviceCredentials,
  serviceDatabaseName,
} from "./connection.js";
import { PUBLIC_UPLOAD_DIR, customerUploadFolder, parseStoredPhotos, savePublicImages } from "../middleware/publicUploads.js";

const PHOTO_BATCH_SIZE = 20;
const databaseFor = (service) => serviceDatabaseName(DB_CONFIG.database, service);

async function relocateCustomerTables(connection) {
  for (const [table, service] of [
    ["MaintenanceRequest", "maintenance"], ["MaintenancePhoto", "maintenance"],
    ["Payment", "payment"], ["PaymentSlip", "payment"], ["PaymentSlipRejection", "payment"],
  ]) {
    const source = databaseFor("customer");
    const target = databaseFor(service);
    const [rows] = await connection.query(
      "SELECT TABLE_SCHEMA, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_NAME = ? AND TABLE_SCHEMA IN (?, ?)",
      [table, source, target],
    );
    const sourceType = rows.find((row) => row.TABLE_SCHEMA === source)?.TABLE_TYPE;
    const targetType = rows.find((row) => row.TABLE_SCHEMA === target)?.TABLE_TYPE;
    if (sourceType === "BASE TABLE") {
      if (targetType === "BASE TABLE") throw new Error(`Both customer and ${service} own ${table}; refusing to overwrite data`);
      if (targetType === "VIEW") await connection.query("DROP VIEW ??.??", [target, table]);
      await connection.query("RENAME TABLE ??.?? TO ??.??", [source, table, target, table]);
    } else if (sourceType === "VIEW" && targetType !== "BASE TABLE") {
      throw new Error(`Missing physical ${service}.${table} table`);
    }
  }
}

async function createServiceDatabases(connection) {
  for (const service of SCHEMA_SERVICES) {
    await connection.query(
      "CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      [databaseFor(service)],
    );
  }
}

async function createForeignViews(connection, service, availableServices = SCHEMA_SERVICES) {
  if (ISOLATED_SERVICES.has(service)) return;
  const database = databaseFor(service);
  for (const sourceService of availableServices) {
    if (sourceService === service || ISOLATED_SERVICES.has(sourceService)) continue;
    for (const table of TABLES_BY_SERVICE[sourceService]) {
      await connection.query("CREATE OR REPLACE VIEW ??.?? AS SELECT * FROM ??.??", [
        database, table, databaseFor(sourceService), table,
      ]);
    }
  }
}

async function applySchema(connection, refreshOnly = false) {
  const availableServices = [];
  for (const service of SCHEMA_SERVICES) {
    await createForeignViews(connection, service, refreshOnly ? SCHEMA_SERVICES : availableServices);
    await connection.changeUser({ database: databaseFor(service) });
    const sql = await readFile(new URL(`./schema/${service}.sql`, import.meta.url), "utf8");
    const qualifiedSql = sql.replace(/\bREFERENCES\s+`?([A-Za-z][A-Za-z0-9_]*)`?\s*\(/gi, (match, table) => {
      const owner = TABLE_OWNER[table];
      if (!owner) throw new Error(`Unknown foreign-key table ${table} in ${service} schema`);
      return `REFERENCES \`${databaseFor(owner)}\`.\`${table}\` (`;
    });
    try {
      await connection.query(qualifiedSql);
    } catch (error) {
      error.message = `Schema migration for ${service} failed: ${error.message}`;
      throw error;
    }
    availableServices.push(service);
  }
  for (const service of SCHEMA_SERVICES) await createForeignViews(connection, service);
}

async function copyLegacyData(connection) {
  const [sourceTables] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
    [DB_CONFIG.database],
  );
  if (sourceTables.length === 0) return false;
  const legacyTables = new Set(sourceTables.map((row) => row.TABLE_NAME));
  const unknownTables = [...legacyTables].filter((table) => !TABLE_OWNER[table]);
  if (unknownTables.length) throw new Error(`Unmapped legacy tables: ${unknownTables.join(", ")}`);

  const authDatabase = databaseFor("auth");
  await connection.query(
    "CREATE TABLE IF NOT EXISTS ??.SchemaCutover (source_schema VARCHAR(64) PRIMARY KEY, status ENUM('copying', 'complete') NOT NULL)",
    [authDatabase],
  );
  const [[marker]] = await connection.query(
    "SELECT status FROM ??.SchemaCutover WHERE source_schema = ?",
    [authDatabase, DB_CONFIG.database],
  );
  if (marker?.status === "complete") return false;

  const counts = new Map();
  for (const table of legacyTables) {
    const [[{ count }]] = await connection.query("SELECT COUNT(*) AS count FROM ??.??", [DB_CONFIG.database, table]);
    counts.set(table, count);
  }
  if (!marker && [...counts.values()].every((count) => count === 0)) return false;
  if (!marker) {
    for (const [service, tables] of Object.entries(TABLES_BY_SERVICE)) {
      for (const table of tables) {
        if (!legacyTables.has(table)) continue;
        const [[{ count }]] = await connection.query("SELECT COUNT(*) AS count FROM ??.??", [databaseFor(service), table]);
        if (count !== 0) throw new Error(`Refusing legacy copy: ${service}.${table} already contains data`);
      }
    }
    await connection.query(
      "INSERT INTO ??.SchemaCutover (source_schema, status) VALUES (?, 'copying')",
      [authDatabase, DB_CONFIG.database],
    );
  }

  for (const service of SCHEMA_SERVICES) {
    for (const table of TABLES_BY_SERVICE[service]) {
      if (!legacyTables.has(table)) continue;
      const [columns] = await connection.query(
        `SELECT source.COLUMN_NAME FROM information_schema.COLUMNS source
         JOIN information_schema.COLUMNS target
           ON target.TABLE_SCHEMA = ? AND target.TABLE_NAME = source.TABLE_NAME
          AND target.COLUMN_NAME = source.COLUMN_NAME
         WHERE source.TABLE_SCHEMA = ? AND source.TABLE_NAME = ?
         ORDER BY source.ORDINAL_POSITION`,
        [databaseFor(service), DB_CONFIG.database, table],
      );
      if (columns.length === 0) throw new Error(`No matching columns for legacy table ${table}`);
      const identifiers = columns.map((column) => connection.escapeId(column.COLUMN_NAME)).join(", ");
      await connection.query(
        `INSERT IGNORE INTO ${connection.escapeId(databaseFor(service))}.${connection.escapeId(table)} (${identifiers})
         SELECT ${identifiers} FROM ${connection.escapeId(DB_CONFIG.database)}.${connection.escapeId(table)}`,
      );
      const [[{ count }]] = await connection.query("SELECT COUNT(*) AS count FROM ??.??", [databaseFor(service), table]);
      if (count !== counts.get(table)) {
        throw new Error(`Legacy copy count mismatch for ${table}: expected ${counts.get(table)}, got ${count}`);
      }
    }
  }
  await connection.query(
    "UPDATE ??.SchemaCutover SET status = 'complete' WHERE source_schema = ?",
    [authDatabase, DB_CONFIG.database],
  );
  return true;
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

const CUSTOMER_UPLOAD_SOURCES = [
  { table: "Payment", column: "slip_path", sql: (t) => `SELECT p.slip_path AS value, b.customer_id FROM ${t("Payment")} p JOIN ${t("Booking")} b ON b.id = p.booking_id WHERE p.slip_path LIKE '/uploads/%'` },
  { table: "PaymentSlip", column: "slip_path", sql: (t) => `SELECT slip_path AS value, customer_id FROM ${t("PaymentSlip")}` },
  { table: "PaymentSlipRejection", column: "slip_path", sql: (t) => `SELECT slip_path AS value, customer_id FROM ${t("PaymentSlipRejection")}` },
  { table: "ResidentVisitRequest", column: "fine_slip_path", sql: (t) => `SELECT fine_slip_path AS value, customer_id FROM ${t("ResidentVisitRequest")} WHERE fine_slip_path IS NOT NULL` },
  { table: "ResidentVisitRequest", column: "vehicle_photos", json: true, sql: (t) => `SELECT vehicle_photos AS value, customer_id FROM ${t("ResidentVisitRequest")} WHERE vehicle_photos LIKE '%/uploads/%'` },
  { table: "ParcelPhoto", column: "url", sql: (t) => `SELECT ph.url AS value, p.customer_id FROM ${t("ParcelPhoto")} ph JOIN ${t("Parcel")} p ON p.id = ph.parcel_id` },
  { table: "ContractImage", column: "url", sql: (t) => `SELECT url AS value, customer_id FROM ${t("ContractImage")}` },
  { table: "MaintenancePhoto", column: "url", sql: (t) => `SELECT mp.url AS value, mr.customer_id FROM ${t("MaintenancePhoto")} mp JOIN ${t("MaintenanceRequest")} mr ON mr.id = mp.maintenance_request_id WHERE mp.url IS NOT NULL` },
  { table: "SafetyIncident", column: "photos", json: true, sql: (t) => `SELECT photos AS value, reporter_id AS customer_id FROM ${t("SafetyIncident")} WHERE reporter_role = 'Customer' AND photos LIKE '%/uploads/%'` },
  { table: "MoveOutInspection", column: "photos", json: true, sql: (t) => `SELECT moi.photos AS value, tr.customer_id FROM ${t("MoveOutInspection")} moi LEFT JOIN ${t("TenantRequest")} tr ON tr.id = moi.tenant_request_id WHERE moi.photos LIKE '%/uploads/%'` },
  { table: "MoveInInspection", column: "photos", json: true, sql: (t) => `SELECT photos AS value, customer_id FROM ${t("MoveInInspection")} WHERE photos LIKE '%/uploads/%'` },
];
const ROOT_UPLOAD_URL = /^\/uploads\/([a-z-]+)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/;

async function moveCustomerUploadsToFolders(connection) {
  const qualified = (table) => `\`${databaseFor(TABLE_OWNER[table])}\`.\`${table}\``;
  const targets = new Map();
  for (const source of CUSTOMER_UPLOAD_SOURCES) {
    const [rows] = await connection.query(source.sql(qualified));
    for (const row of rows) {
      const urls = source.json ? parseStoredPhotos(row.value).map((photo) => photo.url) : [row.value];
      for (const url of urls) {
        const match = ROOT_UPLOAD_URL.exec(url ?? "");
        if (match && !targets.has(url)) targets.set(url, `/uploads/${customerUploadFolder(match[1], row.customer_id)}/${match[2]}`);
      }
    }
  }

  const moved = [];
  for (const [from, to] of targets) {
    const fromPath = path.join(PUBLIC_UPLOAD_DIR, from.slice("/uploads/".length));
    const toPath = path.join(PUBLIC_UPLOAD_DIR, to.slice("/uploads/".length));
    try {
      await mkdir(path.dirname(toPath), { recursive: true });
      await rename(fromPath, toPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      try {
        await access(toPath);
      } catch {
        continue;
      }
    }
    moved.push([from, to]);
  }

  for (const [from, to] of moved) {
    for (const source of CUSTOMER_UPLOAD_SOURCES) {
      const target = qualified(source.table);
      if (source.json) {
        await connection.query(
          `UPDATE ${target} SET ${source.column} = REPLACE(${source.column}, ?, ?) WHERE ${source.column} LIKE ?`,
          [`"${from}"`, `"${to}"`, `%"${from}"%`],
        );
      } else {
        await connection.query(`UPDATE ${target} SET ${source.column} = ? WHERE ${source.column} = ?`, [to, from]);
      }
    }
    await connection.query(
      `UPDATE ${qualified("AuditLog")} SET details = REPLACE(details, ?, ?) WHERE details LIKE ?`,
      [`"${from}"`, `"${to}"`, `%"${from}"%`],
    );
  }
  return moved.length;
}

async function grantIsolatedServiceUsers(connection) {
  for (const service of ISOLATED_SERVICES) {
    const credentials = serviceCredentials(service);
    if (!credentials) {
      console.warn(`No dedicated database user for ${service}; set ${service.toUpperCase()}_DB_USER and ${service.toUpperCase()}_DB_PASSWORD`);
      continue;
    }
    if (!/^[A-Za-z0-9_]{1,32}$/.test(credentials.user)) throw new Error(`Invalid database user name for ${service}`);
    await connection.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?", [credentials.user, credentials.password]);
    await connection.query("ALTER USER ?@'%' IDENTIFIED BY ?", [credentials.user, credentials.password]);
    await connection.query("REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@'%'", [credentials.user]);
    await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ??.* TO ?@'%'", [databaseFor(service), credentials.user]);
    await connection.query("GRANT INSERT ON ??.Notification TO ?@'%'", [databaseFor("owner"), credentials.user]);
  }
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
    await createServiceDatabases(connection);
    await relocateCustomerTables(connection);
    await applySchema(connection);
    const copied = await copyLegacyData(connection);
    if (copied) await applySchema(connection, true);
    await grantIsolatedServiceUsers(connection);
    await connection.changeUser({ database: databaseFor("maintenance") });
    const moved = await moveMaintenancePhotosToFiles(connection);
    const relocated = await moveCustomerUploadsToFolders(connection);
    console.log(`Service databases for "${database}" are ready.${copied ? " Legacy data copied." : ""}${moved ? ` Moved ${moved} maintenance photos to files.` : ""}${relocated ? ` Moved ${relocated} uploads into customer folders.` : ""}`);
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
