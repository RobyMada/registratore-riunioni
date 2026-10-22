import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, "app.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    -- recording | queued | transcribing | generating | done | error
    status TEXT NOT NULL DEFAULT 'recording',
    error TEXT,
    transcript TEXT
  );
  CREATE TABLE IF NOT EXISTS documents (
    meeting_id TEXT NOT NULL REFERENCES meetings(id),
    type TEXT NOT NULL,
    -- queued | done | error
    status TEXT NOT NULL DEFAULT 'queued',
    content TEXT,
    error TEXT,
    PRIMARY KEY (meeting_id, type)
  );
`);

// Un lavoro interrotto da un riavvio del server riparte dalla coda
db.exec(`UPDATE meetings SET status = 'queued' WHERE status IN ('transcribing', 'generating')`);

export interface Meeting {
  id: string;
  title: string;
  created_at: string;
  mime_type: string;
  chunk_count: number;
  status: string;
  error: string | null;
  transcript: string | null;
}

export interface MeetingDocument {
  meeting_id: string;
  type: string;
  status: string;
  content: string | null;
  error: string | null;
}

export function audioDir(meetingId: string) {
  return path.join(config.dataDir, "audio", meetingId);
}
