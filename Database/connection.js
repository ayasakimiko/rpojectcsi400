import mysql from "mysql2/promise";
import "dotenv/config";

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

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...DB_CONFIG,
      waitForConnections: true,
      connectionLimit: poolSize,
      maxIdle: Math.min(2, poolSize),
      idleTimeout: 30000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}
