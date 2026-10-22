import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
  appPassword: process.env.APP_PASSWORD ?? "",
  assemblyAiKey: process.env.ASSEMBLYAI_API_KEY ?? "",
  mockAi: process.env.MOCK_AI === "1",
};
