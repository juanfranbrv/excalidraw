// Servidor de Awordz Draw.
// Hace tres cosas:
//   1. Login del equipo: una contraseña común y el nombre de cada persona.
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

const PORT = Number(process.env.PORT || 3015);
const DATA_DIR = process.env.DATA_DIR || "./data";
const TEAM_PASSWORD = process.env.TEAM_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const COOKIE_SECURE = process.env.COOKIE_SECURE !== "false";
const COOKIE_NAME = "draw_session";
const SESSION_DAYS = 90;

if (!TEAM_PASSWORD || !SESSION_SECRET) {
  console.error("Faltan TEAM_PASSWORD o SESSION_SECRET en el entorno.");
  process.exit(1);
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
  getShareLink: db.prepare("SELECT data FROM share_links WHERE id = ?"),
  putShareLink: db.prepare(
    "INSERT INTO share_links (id, data, created_by, created_at) VALUES (?, ?, ?, ?)",
  ),
};

// --- Sesión ------------------------------------------------------------------
// La cookie lleva "nombre|caducidad|firma". La firma es un HMAC con SESSION_SECRET.

const sign = (value) =>
  crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");

const makeSessionCookie = (name) => {
  const expires = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const value = `${Buffer.from(name).toString("base64url")}|${expires}`;
  return `${value}|${sign(value)}`;
};

const readSession = (cookieHeader = "") => {
  const raw = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!raw) {
    return null;
  }
  const [nameB64, expires, signature] = decodeURIComponent(
    raw.slice(COOKIE_NAME.length + 1),
  ).split("|");
  if (!nameB64 || !expires || !signature) {
    return null;
  }
  const expected = sign(`${nameB64}|${expires}`);
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }
  if (Number(expires) < Date.now()) {
    return null;
  }
  return { name: Buffer.from(nameB64, "base64url").toString("utf8") };
};

const cookieOptions = () =>
  `Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 3600}${
    COOKIE_SECURE ? "; Secure" : ""
  }`;

const safeEqual = (a, b) => {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// --- API HTTP ----------------------------------------------------------------

const app = express();
app.disable("x-powered-by");

const requireAuth = (req, res, next) => {
  const session = readSession(req.headers.cookie);
  if (!session) {
    return res.status(401).json({ error: "no-session" });
  }
  req.user = session;
  next();
};

const isValidId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
const isValidPath = (p) =>
  typeof p === "string" &&
  /^[a-zA-Z0-9_\-/]{1,256}$/.test(p) &&
  !p.includes("..");

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/login", express.json(), (req, res) => {
  const { password, name } = req.body || {};
  const cleanName = typeof name === "string" ? name.trim().slice(0, 40) : "";
  if (typeof password !== "string" || !safeEqual(password, TEAM_PASSWORD)) {
    return res.status(401).json({ error: "bad-password" });
  }
  if (!cleanName) {
    return res.status(400).json({ error: "no-name" });
  }
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(
      makeSessionCookie(cleanName),
    )}; ${cookieOptions()}`,
  );
  res.json({ name: cleanName });
});

app.post("/api/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) =>
  res.json({ name: req.user.name }),
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
    callback(null, Boolean(readSession(req.headers.cookie)));
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
