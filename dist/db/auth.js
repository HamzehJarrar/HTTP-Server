import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "crypto";
export async function hashPassword(password) {
    return await argon2.hash(password);
}
export async function checkPassword(hash, password) {
    return await argon2.verify(hash, password);
}
export function makeJWT(userID, expiresIn, secret) {
    const payload = {
        iss: "chirpy",
        sub: userID,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresIn,
    };
    return jwt.sign(payload, secret);
}
export function validateJWT(tokenString, secret) {
    try {
        const decoded = jwt.verify(tokenString, secret);
        if (!decoded.sub)
            throw new Error("Invalid token: no user ID");
        return decoded.sub;
    }
    catch (err) {
        throw new Error("Invalid or expired token");
    }
}
export function getBearerToken(req) {
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
export const makeRefreshToken = () => {
    return crypto.randomBytes(32).toString("hex");
};
