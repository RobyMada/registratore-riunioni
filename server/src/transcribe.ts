import fs from "node:fs/promises";
import { config } from "./config.js";

const API = "https://api.assemblyai.com/v2";

interface Utterance {
  speaker: string;
  text: string;
  start: number;
}

function timestamp(ms: number) {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: config.assemblyAiKey, ...init.headers },
  });
  if (!res.ok) throw new Error(`AssemblyAI ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Trascrive il file audio in italiano, separando chi parla. */
export async function transcribe(audioPath: string): Promise<string> {
  if (config.mockAi) {
    return "[00:00:00] Partecipante A: Questa è una trascrizione di prova generata senza servizi esterni.";
  }
  if (!config.assemblyAiKey) throw new Error("ASSEMBLYAI_API_KEY non configurata");

  const audio = await fs.readFile(audioPath);
  const { upload_url } = await call("/upload", {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: audio,
  });
  const job = await call("/transcript", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, language_code: "it", speaker_labels: true }),
  });

  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const result = await call(`/transcript/${job.id}`);
    if (result.status === "error") throw new Error(`Trascrizione fallita: ${result.error}`);
    if (result.status === "completed") {
      const utterances: Utterance[] = result.utterances ?? [];
      if (utterances.length === 0) return result.text ?? "";
      return utterances
        .map((u) => `[${timestamp(u.start)}] Partecipante ${u.speaker}: ${u.text}`)
        .join("\n");
    }
  }
}
