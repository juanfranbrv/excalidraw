// Servidor de Awordz Draw.
// Hace tres cosas:
//   1. Cuentas de usuario con Better Auth (ver auth.mjs).
//   2. Colaboración en vivo: reenvía los cambios entre navegadores (protocolo de excalidraw-room).
//   3. Almacenamiento: dibujos, escenas de sala, imágenes y enlaces compartidos, en SQLite.
// Los datos de las escenas llegan cifrados desde el navegador. El servidor solo los guarda.

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import express from "express";
import { Server } from "socket.io";

import { createAuth } from "./auth.mjs";

const PORT = Number(process.env.PORT || 3015);
const DATA_DIR = process.env.DATA_DIR || "./data";

for (const name of [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
]) {
  if (!process.env[name]) {
    console.error(`Falta ${name} en el entorno.`);
    process.exit(1);
  }
}

// --- Base de datos -----------------------------------------------------------

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "draw.sqlite"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS drawings (
    id TEXT PRIMARY KEY,          -- id de la sala de colaboración
    room_key TEXT NOT NULL,       -- clave de cifrado de la sala
    title TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
  );
  CREATE TABLE IF NOT EXISTS scenes (
    room_id TEXT PRIMARY KEY,
    scene_version INTEGER NOT NULL,
    ciphertext BLOB NOT NULL,
    iv BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,        -- p. ej. files/rooms/<roomId>/<fileId>
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    drawing_id TEXT NOT NULL,
    parent_id TEXT,               -- null: comentario principal (hilo); si no, respuesta
    x REAL,                       -- posición en el lienzo (solo el principal)
    y REAL,
    text TEXT NOT NULL,
    author_id TEXT NOT NULL,      -- id de usuario de Better Auth
    author_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    resolved_by TEXT
  );
  CREATE INDEX IF NOT EXISTS comments_drawing ON comments (drawing_id);
`);

const q = {
  listDrawings: db.prepare(
    "SELECT id, room_key AS roomKey, title, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt, updated_by AS updatedBy FROM drawings ORDER BY updated_at DESC",
  ),
  getDrawing: db.prepare("SELECT id FROM drawings WHERE id = ?"),
  insertDrawing: db.prepare(
    "INSERT INTO drawings (id, room_key, title, created_by, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ),
  renameDrawing: db.prepare(
    "UPDATE drawings SET title = ?, updated_at = ?, updated_by = ? WHERE id = ?",
  ),
  touchDrawing: db.prepare(
    "UPDATE drawings SET updated_at = ?, updated_by = ? WHERE id = ?",
  ),
  deleteDrawing: db.prepare("DELETE FROM drawings WHERE id = ?"),
  getScene: db.prepare(
    "SELECT scene_version AS sceneVersion, ciphertext, iv FROM scenes WHERE room_id = ?",
  ),
  putScene: db.prepare(
    `INSERT INTO scenes (room_id, scene_version, ciphertext, iv, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(room_id) DO UPDATE SET scene_version = excluded.scene_version, ciphertext = excluded.ciphertext, iv = excluded.iv, updated_at = excluded.updated_at`,
  ),
  deleteScene: db.prepare("DELETE FROM scenes WHERE room_id = ?"),
  getFile: db.prepare("SELECT data FROM files WHERE path = ?"),
  putFile: db.prepare(
    "INSERT OR REPLACE INTO files (path, data, created_at) VALUES (?, ?, ?)",
  ),
  deleteRoomFiles: db.prepare("DELETE FROM files WHERE path LIKE ?"),
  listComments: db.prepare(
    "SELECT id, parent_id AS parentId, x, y, text, author_id AS authorId, author_name AS authorName, created_at AS createdAt, resolved_at AS resolvedAt, resolved_by AS resolvedBy FROM comments WHERE drawing_id = ? ORDER BY created_at",
  ),
  getComment: db.prepare(
    "SELECT id, drawing_id AS drawingId, parent_id AS parentId, author_id AS authorId FROM comments WHERE id = ?",
  ),
  insertComment: db.prepare(
    "INSERT INTO comments (id, drawing_id, parent_id, x, y, text, author_id, author_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ),
  resolveComment: db.prepare(
    "UPDATE comments SET resolved_at = ?, resolved_by = ? WHERE id = ?",
  ),
  moveComment: db.prepare("UPDATE comments SET x = ?, y = ? WHERE id = ?"),
  deleteComment: db.prepare(
    "DELETE FROM comments WHERE id = ? OR parent_id = ?",
  ),
  deleteDrawingComments: db.prepare(
    "DELETE FROM comments WHERE drawing_id = ?",
  ),
  getShareLink: db.prepare("SELECT data FROM share_links WHERE id = ?"),
  putShareLink: db.prepare(
    "INSERT INTO share_links (id, data, created_by, created_at) VALUES (?, ?, ?, ?)",
  ),
};

// --- API HTTP ----------------------------------------------------------------

const { handler: authHandler, getUser } = await createAuth(DATA_DIR);

const app = express();
app.disable("x-powered-by");

// Rutas de Better Auth (entrar, crear cuenta, salir...). Van antes de express.json.
app.all("/api/auth/*", authHandler);

const requireAuth = async (req, res, next) => {
  try {
    const user = await getUser(req.headers);
    if (!user) {
      return res.status(401).json({ error: "no-session" });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

const isValidId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
const isValidPath = (p) =>
  typeof p === "string" &&
  /^[a-zA-Z0-9_\-/]{1,256}$/.test(p) &&
  !p.includes("..");

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/me", requireAuth, (req, res) =>
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email }),
);

// Dibujos guardados (la lista del equipo).
app.get("/api/drawings", requireAuth, (_req, res) => {
  res.json(q.listDrawings.all());
});

app.post("/api/drawings", requireAuth, express.json(), (req, res) => {
  const { id, roomKey, title } = req.body || {};
  if (!isValidId(id) || typeof roomKey !== "string" || roomKey.length !== 22) {
    return res.status(400).json({ error: "bad-input" });
  }
  if (q.getDrawing.get(id)) {
    return res.status(409).json({ error: "exists" });
  }
  const now = Date.now();
  const cleanTitle =
    String(title || "Sin título")
      .trim()
      .slice(0, 120) || "Sin título";
  q.insertDrawing.run(
    id,
    roomKey,
    cleanTitle,
    req.user.name,
    now,
    now,
    req.user.name,
  );
  res.status(201).json({ id });
});

app.patch("/api/drawings/:id", requireAuth, express.json(), (req, res) => {
  const title = String(req.body?.title || "")
    .trim()
    .slice(0, 120);
  if (!title) {
    return res.status(400).json({ error: "no-title" });
  }
  q.renameDrawing.run(title, Date.now(), req.user.name, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/drawings/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: "bad-id" });
  }
  q.deleteDrawing.run(id);
  q.deleteScene.run(id);
  q.deleteRoomFiles.run(`files/rooms/${id}/%`);
  q.deleteDrawingComments.run(id);
  res.json({ ok: true });
});

// Comentarios de un dibujo guardado. Hilos con posición en el lienzo y respuestas.
app.get("/api/drawings/:id/comments", requireAuth, (req, res) => {
  res.json(q.listComments.all(req.params.id));
});

app.post(
  "/api/drawings/:id/comments",
  requireAuth,
  express.json(),
  (req, res) => {
    const drawingId = req.params.id;
    if (!q.getDrawing.get(drawingId)) {
      return res.status(404).json({ error: "no-drawing" });
    }
    const text = String(req.body?.text || "")
      .trim()
      .slice(0, 4000);
    if (!text) {
      return res.status(400).json({ error: "no-text" });
    }
    const parentId = req.body?.parentId || null;
    let x = null;
    let y = null;
    if (parentId) {
      const parent = q.getComment.get(parentId);
      if (!parent || parent.drawingId !== drawingId || parent.parentId) {
        return res.status(400).json({ error: "bad-parent" });
      }
    } else {
      x = Number(req.body?.x);
      y = Number(req.body?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return res.status(400).json({ error: "no-position" });
      }
    }
    const id = crypto.randomBytes(9).toString("base64url");
    q.insertComment.run(
      id,
      drawingId,
      parentId,
      x,
      y,
      text,
      req.user.id,
      req.user.name,
      Date.now(),
    );
    res.status(201).json({ id });
  },
);

app.patch(
  "/api/comments/:commentId",
  requireAuth,
  express.json(),
  (req, res) => {
    const comment = q.getComment.get(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: "not-found" });
    }
    if (typeof req.body?.resolved === "boolean" && !comment.parentId) {
      q.resolveComment.run(
        req.body.resolved ? Date.now() : null,
        req.body.resolved ? req.user.name : null,
        comment.id,
      );
    }
    if (
      !comment.parentId &&
      Number.isFinite(req.body?.x) &&
      Number.isFinite(req.body?.y)
    ) {
      q.moveComment.run(req.body.x, req.body.y, comment.id);
    }
    res.json({ ok: true });
  },
);

app.delete("/api/comments/:commentId", requireAuth, (req, res) => {
  const comment = q.getComment.get(req.params.commentId);
  if (!comment) {
    return res.status(404).json({ error: "not-found" });
  }
  if (comment.authorId !== req.user.id) {
    return res.status(403).json({ error: "not-author" });
  }
  q.deleteComment.run(comment.id, comment.id);
  res.json({ ok: true });
});

// Escenas de sala (sustituye a Firestore). El contenido va cifrado.
app.get("/api/scenes/:roomId", requireAuth, (req, res) => {
  const row = q.getScene.get(req.params.roomId);
  if (!row) {
    return res.status(404).json({ error: "not-found" });
  }
  res.json({
    sceneVersion: row.sceneVersion,
    ciphertext: Buffer.from(row.ciphertext).toString("base64"),
    iv: Buffer.from(row.iv).toString("base64"),
  });
});

app.put(
  "/api/scenes/:roomId",
  requireAuth,
  express.json({ limit: "50mb" }),
  (req, res) => {
    const { roomId } = req.params;
    const { sceneVersion, ciphertext, iv } = req.body || {};
    if (
      !isValidId(roomId) ||
      typeof ciphertext !== "string" ||
      typeof iv !== "string"
    ) {
      return res.status(400).json({ error: "bad-input" });
    }
    const now = Date.now();
    q.putScene.run(
      roomId,
      Number(sceneVersion) || 0,
      Buffer.from(ciphertext, "base64"),
      Buffer.from(iv, "base64"),
      now,
    );
    q.touchDrawing.run(now, req.user.name, roomId);
    res.json({ ok: true });
  },
);

// Imágenes de los dibujos (sustituye a Firebase Storage). Van cifradas.
app.get(/^\/api\/files\/(.+)$/, requireAuth, (req, res) => {
  const filePath = req.params[0];
  if (!isValidPath(filePath)) {
    return res.status(400).end();
  }
  const row = q.getFile.get(filePath);
  if (!row) {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.end(Buffer.from(row.data));
});

app.put(
  /^\/api\/files\/(.+)$/,
  requireAuth,
  express.raw({ type: () => true, limit: "20mb" }),
  (req, res) => {
    const filePath = req.params[0];
    if (!isValidPath(filePath) || !Buffer.isBuffer(req.body)) {
      return res.status(400).end();
    }
    q.putFile.run(filePath, req.body, Date.now());
    res.json({ ok: true });
  },
);

// Enlaces compartibles (sustituye a json.excalidraw.com).
app.post(
  "/api/v2/post/",
  requireAuth,
  express.raw({ type: () => true, limit: "20mb" }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "empty" });
    }
    const id = crypto.randomBytes(12).toString("base64url");
    q.putShareLink.run(id, req.body, req.user.name, Date.now());
    res.json({ id });
  },
);

app.get("/api/v2/:id", requireAuth, (req, res) => {
  const row = q.getShareLink.get(req.params.id);
  if (!row) {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", "application/octet-stream");
  res.end(Buffer.from(row.data));
});

// --- Colaboración en vivo (protocolo de excalidraw-room) ---------------------

const server = http.createServer(app);
const io = new Server(server, {
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 20e6,
  allowRequest: (req, callback) => {
    getUser(req.headers)
      .then((user) => callback(null, Boolean(user)))
      .catch(() => callback(null, false));
  },
});

io.on("connection", (socket) => {
  io.to(socket.id).emit("init-room");

  socket.on("join-room", async (roomID) => {
    await socket.join(roomID);
    const sockets = await io.in(roomID).fetchSockets();
    if (sockets.length <= 1) {
      io.to(socket.id).emit("first-in-room");
    } else {
      socket.broadcast.to(roomID).emit("new-user", socket.id);
    }
    io.in(roomID).emit(
      "room-user-change",
      sockets.map((s) => s.id),
    );
  });

  socket.on("server-broadcast", (roomID, encryptedData, iv) => {
    socket.broadcast.to(roomID).emit("client-broadcast", encryptedData, iv);
  });

  socket.on("server-volatile-broadcast", (roomID, encryptedData, iv) => {
    socket.volatile.broadcast
      .to(roomID)
      .emit("client-broadcast", encryptedData, iv);
  });

  socket.on("user-follow", async (payload) => {
    const socketId = payload?.userToFollow?.socketId;
    if (!socketId) {
      return;
    }
    const roomID = `follow@${socketId}`;
    if (payload.action === "FOLLOW") {
      await socket.join(roomID);
    } else if (payload.action === "UNFOLLOW") {
      await socket.leave(roomID);
    }
    const sockets = await io.in(roomID).fetchSockets();
    io.to(socketId).emit(
      "user-follow-room-change",
      sockets.map((s) => s.id),
    );
  });

  socket.on("disconnecting", async () => {
    for (const roomID of Array.from(socket.rooms)) {
      const others = (await io.in(roomID).fetchSockets()).filter(
        (s) => s.id !== socket.id,
      );
      const isFollowRoom = roomID.startsWith("follow@");
      if (!isFollowRoom && others.length > 0) {
        socket.broadcast.to(roomID).emit(
          "room-user-change",
          others.map((s) => s.id),
        );
      }
      if (isFollowRoom && others.length === 0) {
        io.to(roomID.replace("follow@", "")).emit("broadcast-unfollow");
      }
    }
  });

  socket.on("disconnect", () => {
    socket.removeAllListeners();
  });
});

server.listen(PORT, () => {
  console.log(`Awordz Draw server escuchando en el puerto ${PORT}`);
});
