import { describe, it, expect } from "vitest";
import { makeJWT, validateJWT } from "../src/db/auth";
const secret = "mysecret";
describe("JWT Functions", () => {
    it("should create and validate a JWT", () => {
        const token = makeJWT("user123", 3600, secret);
        const userID = validateJWT(token, secret);
        expect(userID).toBe("user123");
    });
    it("should fail for expired JWT", () => {
        const token = makeJWT("user123", -10, secret);
        expect(() => {
            validateJWT(token, secret);
        }).toThrow();
    });
    it("should fail for JWT signed with wrong secret", () => {
        const token = makeJWT("user123", 3600, secret);
        expect(() => {
            validateJWT(token, "wrongsecret");
        }).toThrow();
    });
});
