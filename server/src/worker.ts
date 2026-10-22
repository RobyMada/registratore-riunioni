import fs from "node:fs";
import path from "node:path";
import { audioDir, db, type Meeting } from "./db.js";
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

/** Trascrive in sequenza le riunioni in coda, in background rispetto alle richieste HTTP. */
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
      setStatus.run("transcribing", null, meeting.id);
      const transcript = await transcribe(assembleAudio(meeting));
      db.prepare(`UPDATE meetings SET transcript = ?, status = 'done' WHERE id = ?`).run(transcript, meeting.id);
    } catch (err) {
      setStatus.run("error", String(err), meeting.id);
    } finally {
      busy = false;
    }
  }, 2000);
}
