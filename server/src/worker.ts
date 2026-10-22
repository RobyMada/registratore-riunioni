import fs from "node:fs";
import path from "node:path";
import { audioDir, db, type Meeting, type MeetingDocument } from "./db.js";
import { isDocumentType } from "./documents.js";
import { generateDocument } from "./generate.js";
import { transcribe } from "./transcribe.js";

/** Unisce i blocchi registrati in un unico file audio. */
function assembleAudio(meeting: Meeting) {
  const dir = audioDir(meeting.id);
  const ext = meeting.mime_type.includes("mp4") ? "m4a" : "webm";
  const output = path.join(dir, `registrazione.${ext}`);
  const fd = fs.openSync(output, "w");
  try {
    for (let seq = 0; seq < meeting.chunk_count; seq++) {
      const chunk = path.join(dir, `${seq}.part`);
      if (!fs.existsSync(chunk)) throw new Error(`Manca il blocco audio ${seq}`);
      fs.writeSync(fd, fs.readFileSync(chunk));
    }
  } finally {
    fs.closeSync(fd);
  }
  return output;
}

const setStatus = db.prepare(`UPDATE meetings SET status = ?, error = ? WHERE id = ?`);

async function processMeeting(meeting: Meeting) {
  let transcript = meeting.transcript;
  if (!transcript) {
    setStatus.run("transcribing", null, meeting.id);
    transcript = await transcribe(assembleAudio(meeting));
    db.prepare(`UPDATE meetings SET transcript = ? WHERE id = ?`).run(transcript, meeting.id);
  }

  setStatus.run("generating", null, meeting.id);
  const docs = db
    .prepare(`SELECT * FROM documents WHERE meeting_id = ? AND status = 'queued'`)
    .all(meeting.id) as MeetingDocument[];
  for (const doc of docs) {
    if (!isDocumentType(doc.type)) continue;
    try {
      const content = await generateDocument(doc.type, meeting.title, meeting.created_at.slice(0, 10), transcript);
      db.prepare(`UPDATE documents SET status = 'done', content = ?, error = NULL WHERE meeting_id = ? AND type = ?`)
        .run(content, meeting.id, doc.type);
    } catch (err) {
      db.prepare(`UPDATE documents SET status = 'error', error = ? WHERE meeting_id = ? AND type = ?`)
        .run(String(err), meeting.id, doc.type);
    }
  }
  setStatus.run("done", null, meeting.id);
}

/** Elabora in sequenza le riunioni in coda, in background rispetto alle richieste HTTP. */
export function startWorker() {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    const meeting = db
      .prepare(`SELECT * FROM meetings WHERE status = 'queued' ORDER BY created_at LIMIT 1`)
      .get() as Meeting | undefined;
    if (!meeting) return;
    busy = true;
    try {
      await processMeeting(meeting);
    } catch (err) {
      setStatus.run("error", String(err), meeting.id);
    } finally {
      busy = false;
    }
  }, 2000);
}
