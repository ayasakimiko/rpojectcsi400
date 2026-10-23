import mysql from "mysql2/promise";
import "dotenv/config";

export const SCHEMA_SERVICES = ["room", "auth", "customer", "maintenance", "payment", "staff", "admin", "owner", "parcel"];

export const TABLES_BY_SERVICE = {
  room: ["Room"],
  auth: ["Customer", "Staff", "Admin", "Owner", "Booking", "ContractImage", "RoomTransfer"],
  customer: ["TenantRequest", "ResidentVisitRequest", "SafetyIncident"],
  maintenance: ["MaintenanceRequest", "MaintenancePhoto"],
  payment: ["Payment", "PaymentSlip", "PaymentSlipRejection"],
  staff: ["MoveOutInspection"],
  admin: ["Announcement", "AnnouncementAcknowledgement", "WaitingList"],
  owner: ["Expense", "RoomOccupancySnapshot", "AuditLog", "DormConfig"],
  parcel: ["Parcel", "ParcelPhoto"],
};

export const TABLE_OWNER = Object.fromEntries(
  Object.entries(TABLES_BY_SERVICE).flatMap(([service, tables]) => tables.map((table) => [table, service])),
);

export function serviceDatabaseName(baseName, service) {
  if (!SCHEMA_SERVICES.includes(service)) throw new Error(`Unknown database service: ${service}`);
  const name = `${baseName}_${service}`;
  if (!/^[a-zA-Z0-9_]+$/.test(name) || name.length > 64) {
    throw new Error(`Invalid MySQL database name: ${name}`);
  }
  return name;
}

const {
  DB_HOST = "localhost",
  DB_PORT = "3308",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME = "projectcsi400",
  DB_POOL_SIZE,
} = process.env;

export const DB_CONFIG = {
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
};

const poolSize = Number(DB_POOL_SIZE) || 4;

let pool;
let databaseService;

export function configureDatabaseService(service) {
  serviceDatabaseName(DB_CONFIG.database, service);
  if (pool || (databaseService && databaseService !== service)) {
    throw new Error("Database service must be configured once before opening a connection");
  }
  databaseService = service;
}

export function getPool() {
  if (!databaseService) throw new Error("Database service has not been configured");
  if (!pool) {
    pool = mysql.createPool({
      ...DB_CONFIG,
      database: serviceDatabaseName(DB_CONFIG.database, databaseService),
      waitForConnections: true,
      connectionLimit: poolSize,
      maxIdle: 1,
      idleTimeout: 10000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}
