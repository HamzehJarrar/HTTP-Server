import express from "express";
import { config } from "./config.js";
const app = express();
app.use(express.json());
const middlewareLogResponses = (req, res, next) => {
    res.on("finish", () => {
        if (res.statusCode !== 200) {
            console.log(`[NON-OK] ${req.method} ${req.url} - Status: ${res.statusCode}`);
        }
    });
    next();
};
function middlewareMetricsInc(req, res, next) {
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
    constructor(message) {
        super(message);
        this.name = "BadRequestError";
    }
}
class UnauthorizedError extends Error {
    constructor(message) {
        super(message);
        this.name = "UnauthorizedError";
    }
}
class ForbiddenError extends Error {
    constructor(message) {
        super(message);
        this.name = "ForbiddenError";
    }
}
class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
    }
}
/*
================================
Functions
================================
*/
function validateChirp(body) {
    if (body.length > 140) {
        throw new BadRequestError("Chirp is too long. Max length is 140");
    }
}
/*
================================
Routes
================================
*/
const handlerReadiness = (req, res) => {
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.send("OK");
};
app.get("/api/healthz", handlerReadiness);
app.get("/admin/metrics", (req, res) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(`
  <html>
    <body>
      <h1>Welcome, Chirpy Admin</h1>
      <p>Chirpy has been visited ${config.fileserverHits} times!</p>
    </body>
  </html>
  `);
});
app.post("/admin/reset", (req, res) => {
    config.fileserverHits = 0;
    res.send("OK");
});
app.post("/api/validate_chirp", (req, res, next) => {
    try {
        const { body } = req.body;
        validateChirp(body);
        const badWords = ["kerfuffle", "sharbert", "fornax"];
        const words = body.split(" ");
        const cleanedWords = words.map((word) => {
            if (badWords.includes(word.toLowerCase())) {
                return "****";
            }
            return word;
        });
        const cleanedBody = cleanedWords.join(" ");
        res.status(200).json({
            cleanedBody: cleanedBody,
        });
    }
    catch (error) {
        next(error);
    }
});
app.use("/app", middlewareMetricsInc);
app.use("/app", express.static("./src/app"));
/*
================================
Error Middleware
================================
*/
function errorMiddleware(err, req, res, next) {
    if (err instanceof BadRequestError) {
        return res.status(400).json({ error: err.message });
    }
    if (err instanceof UnauthorizedError) {
        return res.status(401).json({ error: err.message });
    }
    if (err instanceof ForbiddenError) {
        return res.status(403).json({ error: err.message });
    }
    if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({
        error: "Something went wrong on our end",
    });
}
app.use(errorMiddleware);
app.listen(8080, () => {
    console.log("Server is running on port 8080");
});
