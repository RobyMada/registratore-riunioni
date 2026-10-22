import os from "node:os";
import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
  appPassword: process.env.APP_PASSWORD ?? "",
  whisperBin: process.env.WHISPER_BIN ?? "whisper-cli",
  whisperModel: process.env.WHISPER_MODEL ?? "./models/ggml-small.bin",
  whisperThreads: Number(process.env.WHISPER_THREADS ?? os.availableParallelism()),
  mockTranscription: process.env.MOCK_TRANSCRIPTION === "1",
};
