import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  getPassword,
  setPassword,
  UnauthorizedError,
  type DocumentType,
  type MeetingDetail,
  type MeetingSummary,
} from "./api";
import { Recorder } from "./recorder";

const STATUS_LABEL: Record<MeetingSummary["status"], string> = {
  recording: "Registrazione in corso",
  queued: "In coda per la trascrizione",
  transcribing: "Trascrizione in corso",
  done: "Trascrizione pronta",
  error: "Errore",
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function App() {
  const [view, setView] = useState<"record" | "archive">("record");
  const [openMeeting, setOpenMeeting] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof UnauthorizedError) setNeedsLogin(true);
    else alertMessage(err);
  }, []);

  useEffect(() => {
    api<DocumentType[]>("/api/document-types").then(setDocumentTypes).catch(handleError);
  }, [handleError, needsLogin]);

  if (needsLogin) return <Login onDone={() => setNeedsLogin(false)} />;

  return (
    <div className="app">
      <header>
        <h1>Registratore riunioni</h1>
        <nav>
          <button className={view === "record" ? "active" : ""} onClick={() => setView("record")}>
            Registra
          </button>
          <button
            className={view === "archive" ? "active" : ""}
            onClick={() => {
              setOpenMeeting(null);
              setView("archive");
            }}
          >
            Archivio
          </button>
        </nav>
      </header>
      <main>
        {view === "record" && (
          <RecordView
            documentTypes={documentTypes}
            onError={handleError}
            onQueued={() => setView("archive")}
          />
        )}
        {view === "archive" && !openMeeting && <ArchiveView onOpen={setOpenMeeting} onError={handleError} />}
        {view === "archive" && openMeeting && (
          <MeetingView
            id={openMeeting}
            documentTypes={documentTypes}
            onBack={() => setOpenMeeting(null)}
            onError={handleError}
          />
        )}
      </main>
    </div>
  );
}

function alertMessage(err: unknown) {
  const el = document.getElementById("toast");
  if (el) {
    el.textContent = err instanceof Error ? err.message : String(err);
    el.hidden = false;
    setTimeout(() => (el.hidden = true), 5000);
  }
}

function Login({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState(getPassword());
  return (
    <form
      className="app login"
      onSubmit={(e) => {
        e.preventDefault();
        setPassword(value);
        onDone();
      }}
    >
      <h1>Registratore riunioni</h1>
      <label>
        Password
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>
      <button className="primary">Entra</button>
    </form>
  );
}

function RecordView({
  documentTypes,
  onError,
  onQueued,
}: {
  documentTypes: DocumentType[];
  onError: (err: unknown) => void;
  onQueued: () => void;
}) {
  const recorder = useRef<Recorder | null>(null);
  const [phase, setPhase] = useState<"idle" | "recording" | "uploading" | "choose">("idle");
  const [title, setTitle] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Evita di chiudere la pagina per sbaglio mentre si registra
  useEffect(() => {
    if (phase !== "recording" && phase !== "uploading") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  async function start() {
    try {
      const r = new Recorder();
      r.onPendingChange = setPending;
      await r.start(title);
      recorder.current = r;
      setSeconds(0);
      setPhase("recording");
    } catch (err) {
      onError(err);
    }
  }

  async function stop() {
    setPhase("uploading");
    setChunkCount(await recorder.current!.stop());
    setPhase("choose");
  }

  async function submit(documents: string[]) {
    try {
      await api(`/api/meetings/${recorder.current!.meetingId}/finish`, {
        method: "POST",
        body: JSON.stringify({ chunkCount, documents }),
      });
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      recorder.current = null;
      setTitle("");
      setPhase("idle");
      onQueued();
    } catch (err) {
      onError(err);
    }
  }

  if (phase === "choose") {
    return (
      <DocumentPicker
        title="Quali documenti vuoi generare?"
        hint="La trascrizione avviene sul server: puoi chiudere l'app. Quando è pronta trovi nell'Archivio il testo da copiare in Claude."
        documentTypes={documentTypes}
        submitLabel="Genera"
        onSubmit={submit}
      />
    );
  }

  return (
    <section className="record">
      {phase === "idle" && (
        <input
          className="title"
          placeholder="Titolo della riunione (facoltativo)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      )}
      <div className="timer">{formatDuration(seconds)}</div>
      {phase === "idle" && (
        <button className="record-button" onClick={start} aria-label="Avvia registrazione">
          <span className="dot" />
        </button>
      )}
      {phase === "recording" && (
        <>
          <button className="record-button recording" onClick={stop} aria-label="Ferma registrazione">
            <span className="square" />
          </button>
          <p className="hint">Tieni l'app aperta e lo schermo acceso durante la registrazione.</p>
          {pending > 1 && <p className="hint warn">Connessione lenta: {pending} blocchi audio in attesa di invio.</p>}
        </>
      )}
      {phase === "uploading" && <p className="hint">Invio degli ultimi secondi di audio…</p>}
    </section>
  );
}

function DocumentPicker({
  title,
  hint,
  documentTypes,
  submitLabel,
  onSubmit,
}: {
  title: string;
  hint?: string;
  documentTypes: DocumentType[];
  submitLabel: string;
  onSubmit: (documents: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(["verbale"]);
  const [busy, setBusy] = useState(false);
  return (
    <section className="picker">
      <h2>{title}</h2>
      {documentTypes.map((d) => (
        <label key={d.id} className="option">
          <input
            type="checkbox"
            checked={selected.includes(d.id)}
            onChange={(e) =>
              setSelected((s) => (e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id)))
            }
          />
          {d.label}
        </label>
      ))}
      {hint && <p className="hint">{hint}</p>}
      <button
        className="primary"
        disabled={selected.length === 0 || busy}
        onClick={async () => {
          setBusy(true);
          await onSubmit(selected);
          setBusy(false);
        }}
      >
        {submitLabel}
      </button>
    </section>
  );
}

function ArchiveView({ onOpen, onError }: { onOpen: (id: string) => void; onError: (err: unknown) => void }) {
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const previous = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const list = await api<MeetingSummary[]>("/api/meetings");
        if (!active) return;
        for (const m of list) {
          const before = previous.current.get(m.id);
          if (before && before !== "done" && m.status === "done") notifyReady(m.title);
          previous.current.set(m.id, m.status);
        }
        setMeetings(list);
      } catch (err) {
        onError(err);
      }
    }
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [onError]);

  if (!meetings) return <p className="hint">Caricamento…</p>;
  if (meetings.length === 0) return <p className="hint">Nessuna riunione registrata.</p>;
  return (
    <ul className="meetings">
      {meetings.map((m) => (
        <li key={m.id}>
          <button onClick={() => onOpen(m.id)}>
            <strong>{m.title}</strong>
            <span>{new Date(m.created_at).toLocaleString("it-IT")}</span>
            <span className={`status ${m.status}`}>{STATUS_LABEL[m.status]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

async function notifyReady(title: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker?.getRegistration();
  const body = `La trascrizione di "${title}" è pronta.`;
  if (registration) await registration.showNotification("Registratore riunioni", { body, icon: "/icon.svg" });
  else new Notification("Registratore riunioni", { body });
}

function MeetingView({
  id,
  documentTypes,
  onBack,
  onError,
}: {
  id: string;
  documentTypes: DocumentType[];
  onBack: () => void;
  onError: (err: unknown) => void;
}) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [tab, setTab] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setMeeting(await api<MeetingDetail>(`/api/meetings/${id}`));
    } catch (err) {
      onError(err);
    }
  }, [id, onError]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  if (!meeting) return <p className="hint">Caricamento…</p>;
  const label = (type: string) => documentTypes.find((d) => d.id === type)?.label ?? type;
  const current = meeting.documents.find((d) => d.type === tab) ?? meeting.documents[0];

  if (adding) {
    return (
      <DocumentPicker
        title="Aggiungi un altro documento"
        documentTypes={documentTypes}
        submitLabel="Aggiungi"
        onSubmit={async (documents) => {
          try {
            await api(`/api/meetings/${id}/documents`, { method: "POST", body: JSON.stringify({ documents }) });
            setAdding(false);
            await load();
          } catch (err) {
            onError(err);
          }
        }}
      />
    );
  }

  return (
    <section className="meeting">
      <button className="link" onClick={onBack}>
        ← Archivio
      </button>
      <h2>{meeting.title}</h2>
      <p className={`status ${meeting.status}`}>{STATUS_LABEL[meeting.status]}</p>
      {meeting.error && <p className="hint warn">{meeting.error}</p>}
      <div className="tabs">
        {meeting.documents.map((d) => (
          <button key={d.type} className={current?.type === d.type ? "active" : ""} onClick={() => setTab(d.type)}>
            {label(d.type)}
          </button>
        ))}
        {meeting.transcript && (
          <button className={tab === "transcript" ? "active" : ""} onClick={() => setTab("transcript")}>
            Trascrizione
          </button>
        )}
      </div>
      {tab === "transcript" ? (
        <pre className="document">{meeting.transcript}</pre>
      ) : current?.status === "done" ? (
        <>
          <pre className="document">{current.content}</pre>
          <div className="actions">
            <button onClick={() => navigator.clipboard.writeText(current.content ?? "")}>Copia</button>
            <button onClick={() => download(`${meeting.title} - ${label(current.type)}.md`, current.content ?? "")}>
              Scarica
            </button>
          </div>
        </>
      ) : current?.prompt ? (
        <ClaudeSteps
          key={current.type}
          prompt={current.prompt}
          onSave={async (content) => {
            try {
              await api(`/api/meetings/${id}/documents/${current.type}`, {
                method: "PUT",
                body: JSON.stringify({ content }),
              });
              await load();
            } catch (err) {
              onError(err);
            }
          }}
        />
      ) : current ? (
        <p className="hint">Quando la trascrizione è pronta qui trovi il testo da copiare in Claude. Puoi chiudere l'app.</p>
      ) : null}
      {meeting.status !== "recording" && (
        <button className="link" onClick={() => setAdding(true)}>
          + Aggiungi un altro documento
        </button>
      )}
    </section>
  );
}

function ClaudeSteps({ prompt, onSave }: { prompt: string; onSave: (content: string) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [content, setContent] = useState("");
  return (
    <ol className="steps">
      <li>
        <button
          className="primary"
          onClick={async () => {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
          }}
        >
          {copied ? "Copiato ✓" : "Copia il testo per Claude"}
        </button>
      </li>
      <li>
        <a className="primary" href="https://claude.ai/new" target="_blank" rel="noreferrer">
          Apri Claude e incolla
        </a>
      </li>
      <li>
        <textarea
          placeholder="Incolla qui il documento scritto da Claude per conservarlo nell'archivio"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
        />
        <button className="primary" disabled={!content.trim()} onClick={() => onSave(content)}>
          Salva nell'archivio
        </button>
      </li>
    </ol>
  );
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
