import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { audioDir, db, type Meeting, type MeetingDocument } from "./db.js";
import { DOCUMENT_TYPES, isDocumentType } from "./documents.js";
import { startWorker } from "./worker.js";

const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

app.addHook("onRequest", async (req, reply) => {
  if (!req.url.startsWith("/api/") || !config.appPassword) return;
  const given = Buffer.from(String(req.headers["x-app-password"] ?? ""));
  const expected = Buffer.from(config.appPassword);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return reply.code(401).send({ error: "Password errata" });
  }
});

function getMeeting(id: string) {
  return db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as Meeting | undefined;
}

function documentsOf(id: string) {
  return db.prepare(`SELECT * FROM documents WHERE meeting_id = ? ORDER BY type`).all(id) as MeetingDocument[];
}

app.get("/api/document-types", async () =>
  Object.entries(DOCUMENT_TYPES).map(([id, d]) => ({ id, label: d.label })),
);

app.post<{ Body: { title?: string; mimeType?: string } }>("/api/meetings", async (req) => {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const title = req.body?.title?.trim() || `Riunione del ${createdAt.slice(0, 10)}`;
  db.prepare(`INSERT INTO meetings (id, title, created_at, mime_type) VALUES (?, ?, ?, ?)`)
    .run(id, title, createdAt, req.body?.mimeType ?? "audio/webm");
  fs.mkdirSync(audioDir(id), { recursive: true });
  return { id, title };
});

// I blocchi audio arrivano durante la registrazione; reinviare lo stesso blocco lo sovrascrive
app.put<{ Params: { id: string; seq: string }; Body: Buffer }>("/api/meetings/:id/chunks/:seq", async (req, reply) => {
  const meeting = getMeeting(req.params.id);
  const seq = Number(req.params.seq);
  if (!meeting) return reply.code(404).send({ error: "Riunione non trovata" });
  if (meeting.status !== "recording") return reply.code(409).send({ error: "Registrazione già conclusa" });
  if (!Number.isInteger(seq) || seq < 0) return reply.code(400).send({ error: "Blocco non valido" });
  fs.writeFileSync(path.join(audioDir(meeting.id), `${seq}.part`), req.body);
  return { ok: true };
});

app.post<{ Params: { id: string }; Body: { chunkCount: number; documents: string[] } }>(
  "/api/meetings/:id/finish",
  async (req, reply) => {
    const meeting = getMeeting(req.params.id);
    if (!meeting) return reply.code(404).send({ error: "Riunione non trovata" });
    const types = (req.body?.documents ?? []).filter(isDocumentType);
    if (types.length === 0) return reply.code(400).send({ error: "Scegli almeno un documento" });
    const chunkCount = Number(req.body?.chunkCount);
    for (let seq = 0; seq < chunkCount; seq++) {
      if (!fs.existsSync(path.join(audioDir(meeting.id), `${seq}.part`))) {
        return reply.code(409).send({ error: `Manca il blocco audio ${seq}`, missing: seq });
      }
    }
    db.transaction(() => {
      db.prepare(`UPDATE meetings SET status = 'queued', chunk_count = ? WHERE id = ?`).run(chunkCount, meeting.id);
      const insert = db.prepare(
        `INSERT INTO documents (meeting_id, type) VALUES (?, ?)
         ON CONFLICT (meeting_id, type) DO UPDATE SET status = 'queued', content = NULL, error = NULL`,
      );
      for (const type of types) insert.run(meeting.id, type);
    })();
    return { ok: true };
  },
);

// Chiede un altro documento per una riunione già trascritta
app.post<{ Params: { id: string }; Body: { documents: string[] } }>("/api/meetings/:id/documents", async (req, reply) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return reply.code(404).send({ error: "Riunione non trovata" });
  if (meeting.status === "recording") return reply.code(409).send({ error: "Registrazione in corso" });
  const types = (req.body?.documents ?? []).filter(isDocumentType);
  const insert = db.prepare(
    `INSERT INTO documents (meeting_id, type) VALUES (?, ?)
     ON CONFLICT (meeting_id, type) DO UPDATE SET status = 'queued', content = NULL, error = NULL`,
  );
  for (const type of types) insert.run(meeting.id, type);
  db.prepare(`UPDATE meetings SET status = 'queued', error = NULL WHERE id = ?`).run(meeting.id);
  return { ok: true };
});

app.get("/api/meetings", async () => {
  const meetings = db
    .prepare(`SELECT id, title, created_at, status, error FROM meetings ORDER BY created_at DESC`)
    .all() as Meeting[];
  return meetings.map((m) => ({
    ...m,
    documents: documentsOf(m.id).map(({ type, status, error }) => ({ type, status, error })),
  }));
});

app.get<{ Params: { id: string } }>("/api/meetings/:id", async (req, reply) => {
  const meeting = getMeeting(req.params.id);
  if (!meeting) return reply.code(404).send({ error: "Riunione non trovata" });
  return { ...meeting, documents: documentsOf(meeting.id) };
});

const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/") ? reply.code(404).send({ error: "Non trovato" }) : reply.sendFile("index.html"),
  );
}

startWorker();
await app.listen({ port: config.port, host: "0.0.0.0" });
