/**
 * Readium Annotations API
 * 
 * A lightweight REST API for storing and retrieving EPUB reader annotations.
 * Supports three annotation types:
 *   - bookmarks: a saved reading position (locator)
 *   - highlights: a text selection with a colour (one of 6 colours)
 *   - notes: a text selection with a colour and a user-written note
 *
 * Data is persisted to a local JSON file (data/annotations.json).
 * In production, replace the file-based store with a database adapter.
 *
 * API Routes:
 *   GET    /health                                     Health check
 *   GET    /annotations/:userId/:publicationId         Get all annotations for a user+publication
 *   POST   /annotations/:userId/:publicationId         Create a new annotation
 *   PUT    /annotations/:userId/:publicationId/:id     Update an annotation
 *   DELETE /annotations/:userId/:publicationId/:id     Delete an annotation
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "annotations.json");

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// ─── Data Store ──────────────────────────────────────────────────────────────

/**
 * Ensure the data directory and file exist.
 * Schema: { [userId]: { [publicationId]: Annotation[] } }
 */
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}), "utf8");
  }
}

function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getUserPublicationAnnotations(data, userId, publicationId) {
  if (!data[userId]) data[userId] = {};
  if (!data[userId][publicationId]) data[userId][publicationId] = [];
  return data[userId][publicationId];
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_TYPES = ["bookmark", "highlight", "note"];
const VALID_COLOURS = ["yellow", "green", "blue", "red", "purple", "orange"];

/**
 * Annotation schema:
 * {
 *   id: string (uuid),
 *   type: "bookmark" | "highlight" | "note",
 *   createdAt: ISO string,
 *   updatedAt: ISO string,
 *
 *   // Readium Locator — identifies the position in the EPUB
 *   locator: {
 *     href: string,           // path to the spine item, e.g. "OEBPS/chapter1.xhtml"
 *     type: string,           // media type
 *     title?: string,         // chapter title
 *     locations: {
 *       progression?: number, // 0.0–1.0 within the resource
 *       position?: number,    // absolute position in the publication
 *       cssSelector?: string, // CSS selector for the element
 *       fragments?: string[]  // fragment identifiers
 *     },
 *     text?: {
 *       highlight?: string,   // the selected text (for highlights/notes)
 *       before?: string,      // text before the selection (context)
 *       after?: string        // text after the selection (context)
 *     }
 *   },
 *
 *   // Only for highlight and note
 *   colour?: "yellow" | "green" | "blue" | "red" | "purple" | "orange",
 *
 *   // Only for note
 *   noteText?: string
 * }
 */
function validateAnnotation(body) {
  const errors = [];

  if (!body.type || !VALID_TYPES.includes(body.type)) {
    errors.push(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }

  if (!body.locator || typeof body.locator !== "object") {
    errors.push("locator is required and must be an object");
  } else {
    if (!body.locator.href) errors.push("locator.href is required");
    if (!body.locator.locations || typeof body.locator.locations !== "object") {
      errors.push("locator.locations is required and must be an object");
    }
  }

  if (body.type === "highlight" || body.type === "note") {
    if (!body.colour || !VALID_COLOURS.includes(body.colour)) {
      errors.push(`colour must be one of: ${VALID_COLOURS.join(", ")}`);
    }
    if (!body.locator?.text?.highlight) {
      errors.push("locator.text.highlight (the selected text) is required for highlights and notes");
    }
  }

  if (body.type === "note") {
    if (typeof body.noteText !== "string") {
      errors.push("noteText must be a string for notes");
    }
  }

  return errors;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API info
app.get("/", (req, res) => {
  res.json({
    name: "Readium Annotations API",
    version: "1.0.0",
    endpoints: {
      "GET /health": "Health check",
      "GET /annotations/:userId/:publicationId": "Get all annotations",
      "POST /annotations/:userId/:publicationId": "Create annotation",
      "PUT /annotations/:userId/:publicationId/:id": "Update annotation",
      "DELETE /annotations/:userId/:publicationId/:id": "Delete annotation"
    }
  });
});

/**
 * GET /annotations/:userId/:publicationId
 * Returns all annotations for a user and publication.
 * Optional query params: ?type=bookmark|highlight|note
 */
app.get("/annotations/:userId/:publicationId", (req, res) => {
  const { userId, publicationId } = req.params;
  const { type } = req.query;

  const data = readData();
  let annotations = getUserPublicationAnnotations(data, userId, publicationId);

  if (type && VALID_TYPES.includes(type)) {
    annotations = annotations.filter(a => a.type === type);
  }

  res.json({
    userId,
    publicationId,
    count: annotations.length,
    annotations
  });
});

/**
 * POST /annotations/:userId/:publicationId
 * Creates a new annotation.
 */
app.post("/annotations/:userId/:publicationId", (req, res) => {
  const { userId, publicationId } = req.params;
  const body = req.body;

  const errors = validateAnnotation(body);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  const now = new Date().toISOString();
  const annotation = {
    id: uuidv4(),
    type: body.type,
    createdAt: now,
    updatedAt: now,
    locator: body.locator,
    ...(body.colour && { colour: body.colour }),
    ...(body.noteText !== undefined && { noteText: body.noteText })
  };

  const data = readData();
  const annotations = getUserPublicationAnnotations(data, userId, publicationId);
  annotations.push(annotation);
  writeData(data);

  res.status(201).json(annotation);
});

/**
 * PUT /annotations/:userId/:publicationId/:id
 * Updates an existing annotation (colour or noteText only).
 */
app.put("/annotations/:userId/:publicationId/:id", (req, res) => {
  const { userId, publicationId, id } = req.params;
  const body = req.body;

  const data = readData();
  const annotations = getUserPublicationAnnotations(data, userId, publicationId);
  const idx = annotations.findIndex(a => a.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: "Annotation not found" });
  }

  const existing = annotations[idx];

  // Only allow updating colour and noteText
  if (body.colour !== undefined) {
    if (!VALID_COLOURS.includes(body.colour)) {
      return res.status(400).json({ error: `colour must be one of: ${VALID_COLOURS.join(", ")}` });
    }
    existing.colour = body.colour;
  }

  if (body.noteText !== undefined) {
    if (typeof body.noteText !== "string") {
      return res.status(400).json({ error: "noteText must be a string" });
    }
    existing.noteText = body.noteText;
  }

  existing.updatedAt = new Date().toISOString();
  annotations[idx] = existing;
  writeData(data);

  res.json(existing);
});

/**
 * DELETE /annotations/:userId/:publicationId/:id
 * Deletes an annotation.
 */
app.delete("/annotations/:userId/:publicationId/:id", (req, res) => {
  const { userId, publicationId, id } = req.params;

  const data = readData();
  const annotations = getUserPublicationAnnotations(data, userId, publicationId);
  const idx = annotations.findIndex(a => a.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: "Annotation not found" });
  }

  const deleted = annotations.splice(idx, 1)[0];
  writeData(data);

  res.json({ deleted: true, annotation: deleted });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Readium Annotations API running on port ${PORT}`);
  console.log(`Data stored at: ${DATA_FILE}`);
});
