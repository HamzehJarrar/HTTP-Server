import process from "node:process";
import type { MigrationConfig } from "drizzle-orm/migrator";

process.loadEnvFile();

type APIConfig = {
  fileserverHits: number;
  platform: string;
};

type DBConfig = {
  url: string;
  migrationConfig: MigrationConfig;
};

type Config = {
  api: APIConfig;
  db: DBConfig;
  fileserverHits: 0;
  jwtSecret: string;
};

function envOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export const config: Config = {
  api: {
    fileserverHits: 0,
    platform: envOrThrow("PLATFORM"),
  },
  db: {
    url: envOrThrow("DB_URL"),
    migrationConfig: {
      migrationsFolder: "./src/db/migrations",
    },
  },
  fileserverHits: 0,
  jwtSecret: envOrThrow("JWT_SECRET"),
};

