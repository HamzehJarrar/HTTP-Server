import { asc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "../../index.js";
import { chirps, NewChirp } from "../schema.js";

export async function createChirp(chirp: NewChirp) {
  const [result] = await db.insert(chirps).values(chirp).returning();

  return result;
}

export async function getAllChirps() {
  const allChirps = await db
    .select()
    .from(chirps)
    .orderBy(chirps.createdAt, asc(chirps.createdAt));
  return allChirps;
}

export async function getChirpsById(id: string) {
  const chirp = await db.select().from(chirps).where(eq(chirps.id, id)).limit(1);
  return chirp[0];
}

export async function deleteChirps(chirpId: string) {
  const chirp = await db.delete(chirps).where(eq(chirps.id, chirpId));
  return chirp;
}