import process from "node:process";
process.loadEnvFile();
function envOrThrow(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
}
export const config = {
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
