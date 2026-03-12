import argon2 from "argon2";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Request } from "express";
import crypto from "crypto";

type payload = Pick<JwtPayload, "iss" | "sub" | "iat" | "exp">;

export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password);
}

export async function checkPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return await argon2.verify(hash, password);
}

export function makeJWT(
  userID: string,
  expiresIn: number,
  secret: string,
): string {
  const payload: payload = {
    iss: "chirpy",
    sub: userID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  };
  return jwt.sign(payload, secret);
}

export function validateJWT(tokenString: string, secret: string): string {
  try {
    const decoded = jwt.verify(tokenString, secret) as JwtPayload;
    if (!decoded.sub) throw new Error("Invalid token: no user ID");
    return decoded.sub as string;
  } catch (err) {
    throw new Error("Invalid or expired token");
  }
}

export function getBearerToken(req: Request): string {
  const authHeader = req.get("Authorization");

  if (!authHeader) {
    throw new Error("Authorization header missing");
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Invalid authorization format");
  }

  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    throw new Error("Token missing");
  }

  return token;
}

export const makeRefreshToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

