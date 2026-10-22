import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";

const run = promisify(execFile);

interface WhisperSegment {
  offsets: { from: number; to: number };
  text: string;
}

function timestamp(ms: number) {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Trascrive il file audio in italiano con Whisper, sul server e senza servizi a pagamento. */
export async function transcribe(audioPath: string): Promise<string> {
  if (config.mockTranscription) {
    return "[00:00:00] Questa è una trascrizione di prova generata senza Whisper.";
  }

  const dir = path.dirname(audioPath);
  const wav = path.join(dir, "registrazione.wav");
  const output = path.join(dir, "trascrizione");
  // Whisper vuole audio WAV mono a 16 kHz
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", audioPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
  try {
    await run(
      config.whisperBin,
      ["-m", config.whisperModel, "-f", wav, "-l", "it", "-t", String(config.whisperThreads), "-oj", "-of", output, "-np"],
      { maxBuffer: 64 * 1024 * 1024 },
    );
  } finally {
    await fs.rm(wav, { force: true });
  }

  const result = JSON.parse(await fs.readFile(`${output}.json`, "utf8"));
  const segments: WhisperSegment[] = result.transcription ?? [];
  return segments
    .map((s) => s.text.trim())
    .map((text, i) => (text ? `[${timestamp(segments[i].offsets.from)}] ${text}` : ""))
    .filter(Boolean)
    .join("\n");
}
