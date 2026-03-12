// index.ts
import express, { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  createRefreshToken,
  createUser,
  deleteUsers,
  getUserByEmail,
  updateUser,
} from "./db/queries/users.js";
import {
  createChirp,
  getAllChirps,
  getChirpsById,
  deleteChirps
} from "./db/queries/chirps.js";
import { eq } from "drizzle-orm";

import {
  hashPassword,
  checkPassword,
  makeJWT,
  getBearerToken,
  validateJWT,
  makeRefreshToken,
} from "./db/auth.js";
import { refresh_tokens } from "./db/schema.js";

// --- 1. Database Configuration & Export ---
const queryClient = postgres(config.db.url);
export const db = drizzle(queryClient);

const ACCESS_TOKEN_EXPIRATION = 3600;
const REFRESH_TOKEN_DAYS = 60;

const migrationClient = postgres(config.db.url, { max: 1 });
try {
  await migrate(drizzle(migrationClient), config.db.migrationConfig);
  console.log("Migrations completed successfully");
} catch (err) {
  console.error("Migration failed:", err);
}

const app = express();

// --- 2. Essential Middlewares ---
app.use(express.json());

const middlewareLogResponses = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.on("finish", () => {
    if (res.statusCode >= 400) {
      console.log(
        `[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`,
      );
    }
  });
  next();
};

function middlewareMetricsInc(req: Request, res: Response, next: NextFunction) {
  config.fileserverHits++;
  next();
}

app.use(middlewareLogResponses);

/*
================================
Error Classes
================================
*/
class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}
class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}
class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/*
================================
Routes
================================
*/

app.get("/api/healthz", (req: Request, res: Response) => {
  res.set("Content-Type", "text/plain; charset=utf-8").send("OK");
});

app.get("/admin/metrics", (req: Request, res: Response) => {
  res.set("Content-Type", "text/html; charset=utf-8").send(`
  <html>
    <body>
      <h1>Welcome, Chirpy Admin</h1>
      <p>Chirpy has been visited ${config.fileserverHits} times!</p>
    </body>
  </html>
  `);
});

app.post(
  "/admin/reset",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (config.api.platform !== "dev") {
        throw new ForbiddenError("Reset is only allowed in dev environment");
      }
      await deleteUsers();
      res
        .status(200)
        .json({ message: "Metrics reset and users deleted successfully" });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/users",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      if (!email || typeof email !== "string") {
        throw new BadRequestError("Email is required and must be a string");
      }
      if (!password || typeof password !== "string") {
        throw new BadRequestError("Password is required and must be a string");
      }
      const hashedPassword = await hashPassword(password);
      const user = await createUser({ email, hashedPassword });
      if (!user) {
        throw new BadRequestError("User with this email already exists");
      }
      res.status(201).json({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      if (!email || typeof email !== "string") {
        throw new BadRequestError("Email is required and must be a string");
      }
      if (!password || typeof password !== "string") {
        throw new BadRequestError("Password is required and must be a string");
      }
      const user = await getUserByEmail(email);
      if (!user) {
        throw new UnauthorizedError("Invalid email or password");
      }
      const passwordMatch = await checkPassword(user.hashedPassword, password);
      if (!passwordMatch) {
        throw new UnauthorizedError("Invalid email or password");
      }

      const token = makeJWT(user.id, ACCESS_TOKEN_EXPIRATION, config.jwtSecret);

      const refreshToken = makeRefreshToken();

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

      await createRefreshToken({
        token: refreshToken,
        userId: user.id,
        expiresAt,
      });

      res.status(200).json({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        token: token,
        refreshToken: refreshToken,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/chirps",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = getBearerToken(req);

      let userId: string;

      try {
        userId = validateJWT(token, config.jwtSecret);
      } catch {
        throw new UnauthorizedError("Invalid or expired token");
      }

      const { body } = req.body;

      if (!body || body.length > 140) {
        throw new BadRequestError("Chirp is too long. Max length is 140");
      }

      const badWords = ["kerfuffle", "sharbert", "fornax"];

      const cleanedBody = body
        .split(" ")
        .map((word: string) =>
          badWords.includes(word.toLowerCase()) ? "****" : word,
        )
        .join(" ");

      const chirp = await createChirp({
        body: cleanedBody,
        userId: userId,
      });

      res.status(201).json({
        id: chirp.id,
        createdAt: chirp.createdAt,
        updatedAt: chirp.updatedAt,
        body: chirp.body,
        userId: chirp.userId,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = getBearerToken(req);
      const [dbToken] = await db
        .select()
        .from(refresh_tokens)
        .where(eq(refresh_tokens.token, refreshToken))
        .limit(1);

      if (!dbToken || dbToken.expires_at < new Date() || dbToken.revoked_at) {
        throw new UnauthorizedError("Invalid or expired refresh token");
      }

      const newToken = makeJWT(
        dbToken.userId,
        ACCESS_TOKEN_EXPIRATION,
        config.jwtSecret,
      );

      res.status(200).json({ token: newToken });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/revoke",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = getBearerToken(req);
      await db
        .update(refresh_tokens)
        .set({ revoked_at: new Date() })
        .where(eq(refresh_tokens.token, refreshToken));

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/chirps",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chirps = await getAllChirps();
      const result = chirps.map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        body: c.body,
        userId: c.userId,
      }));
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/chirps/:chirpId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chirpId = req.params.chirpId;
      if (!chirpId || Array.isArray(chirpId)) {
        throw new BadRequestError("Invalid chirp ID");
      }

      const chirp = await getChirpsById(chirpId);

      if (!chirp) {
        return next(new NotFoundError("Chirp not found"));
      }
      res.status(200).json({
        id: chirp.id,
        createdAt: chirp.createdAt,
        updatedAt: chirp.updatedAt,
        body: chirp.body,
        userId: chirp.userId,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.put(
  "/api/users",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let token: string;

      try {
        token = getBearerToken(req);
      } catch {
        throw new UnauthorizedError("Authorization header missing");
      }

      let userId: string;

      try {
        userId = validateJWT(token, config.jwtSecret);
      } catch {
        throw new UnauthorizedError("Invalid or expired token");
      }

      const { email, password } = req.body;

      if (!email || typeof email !== "string") {
        throw new BadRequestError("Email is required");
      }

      if (!password || typeof password !== "string") {
        throw new BadRequestError("Password is required");
      }

      const hashedPassword = await hashPassword(password);

      const user = await updateUser(userId, email, hashedPassword);

      res.status(200).json({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.delete(
  "/api/chirps/:chirpId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let token: string;

      try {
        token = getBearerToken(req);
      } catch {
        throw new UnauthorizedError("Authorization header missing");
      }

      let userId: string;

      try {
        userId = validateJWT(token, config.jwtSecret);
      } catch {
        throw new UnauthorizedError("Invalid or expired token");
      }

      const chirpId = req.params.chirpId;

      if (!chirpId || Array.isArray(chirpId)) {
        throw new BadRequestError("Invalid chirp ID");
      }

      const chirp = await getChirpsById(chirpId);

      if (!chirp) {
        throw new NotFoundError("Chirp not found");
      }

      if (chirp.userId !== userId) {
        throw new ForbiddenError("You can only delete your own chirps");
      }

      await deleteChirps(chirpId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
app.use("/app", middlewareMetricsInc);
app.use("/app", express.static("./src/app"));

/*
================================
Error Middleware
================================
*/
function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  let status = 500;
  if (err instanceof BadRequestError) status = 400;
  else if (err instanceof UnauthorizedError) status = 401;
  else if (err instanceof ForbiddenError) status = 403;
  else if (err instanceof NotFoundError) status = 404;

  if (status === 500) console.error(err);

  res.status(status).json({
    error: err.message || "Something went wrong on our end",
  });
}

app.use(errorMiddleware);

app.listen(8080, () => {
  console.log("Server is running on port 8080");
});
