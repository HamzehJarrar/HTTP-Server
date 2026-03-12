import { db } from "../index.js";
import { NewUser, refresh_tokens, users } from "../schema.js";
import { eq } from "drizzle-orm";

export async function createUser(user: NewUser) {
  const [result] = await db
    .insert(users)
    .values({
      email: user.email,
      hashedPassword: user.hashedPassword,
    })
    .onConflictDoNothing()
    .returning();
  return result;
}

export async function deleteUsers() {
  await db.delete(users);
}

export async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user;
}

export const createRefreshToken = async ({
  token,
  userId,
  expiresAt,
}: {
  token: string;
  userId: string;
  expiresAt: Date;
}) => {
  const result = await db
    .insert(refresh_tokens)
    .values({
      token: token,
      userId: userId,
      expires_at: expiresAt,
    })
    .returning();

  return result[0];
};

export async function updateUser(
  userId: string,
  email: string,
  hashedPassword: string,
) {
  const result = await db
    .update(users)
    .set({
      email: email,
      hashedPassword: hashedPassword,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return result[0];
}