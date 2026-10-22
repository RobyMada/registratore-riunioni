import { api } from "./api";

const CHUNK_MS = 10_000;

function pickMimeType() {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/**
 * Registra dal microfono e carica l'audio sul server a blocchi da 10 secondi,
 * così una connessione instabile o un telefono che si spegne non fanno perdere la riunione.
 */
export class Recorder {
  meetingId = "";
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private wakeLock?: WakeLockSentinel;
  private pending = new Map<number, Blob>();
  private nextSeq = 0;
  private uploading = false;
  onPendingChange?: (pending: number) => void;

  async start(title: string) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const mimeType = pickMimeType();
    const meeting = await api<{ id: string }>("/api/meetings", {
      method: "POST",
      body: JSON.stringify({ title, mimeType: mimeType || "audio/webm" }),
    });
    this.meetingId = meeting.id;

    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      this.pending.set(this.nextSeq++, e.data);
      this.onPendingChange?.(this.pending.size);
      void this.flush();
    };
    this.recorder.start(CHUNK_MS);

    await this.keepScreenOn();
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** Ferma la registrazione e attende che tutto l'audio sia sul server. Restituisce il numero di blocchi. */
  async stop(): Promise<number> {
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    await this.wakeLock?.release().catch(() => {});
    while (this.pending.size > 0) {
      await this.flush();
      if (this.pending.size > 0) await new Promise((r) => setTimeout(r, 3000));
    }
    return this.nextSeq;
  }

  private async flush() {
    if (this.uploading) return;
    this.uploading = true;
    try {
      for (const [seq, blob] of [...this.pending].sort((a, b) => a[0] - b[0])) {
        await api(`/api/meetings/${this.meetingId}/chunks/${seq}`, {
          method: "PUT",
          headers: { "content-type": "application/octet-stream" },
          body: blob,
        });
        this.pending.delete(seq);
        this.onPendingChange?.(this.pending.size);
      }
    } catch {
      // nessuna rete: i blocchi restano in memoria e si riprova al prossimo giro
      setTimeout(() => void this.flush(), 5000);
    } finally {
      this.uploading = false;
    }
  }

  // Su iPhone una web app smette di registrare se lo schermo si spegne
  private async keepScreenOn() {
    try {
      this.wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      // non supportato: l'interfaccia ricorda di tenere lo schermo acceso
    }
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === "visible") void this.keepScreenOn();
  };
}
