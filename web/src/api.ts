const PASSWORD_KEY = "app-password";

export class UnauthorizedError extends Error {}

export function getPassword() {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPassword(value: string) {
  try {
    localStorage.setItem(PASSWORD_KEY, value);
  } catch {
    // senza localStorage la password va reinserita a ogni apertura
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-app-password", getPassword());
  if (init.body && !(init.body instanceof Blob)) headers.set("content-type", "application/json");
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) throw new UnauthorizedError("Password errata");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
  return data as T;
}

export interface DocumentType {
  id: string;
  label: string;
}

export interface MeetingSummary {
  id: string;
  title: string;
  created_at: string;
  status: "recording" | "queued" | "transcribing" | "done" | "error";
  error: string | null;
  documents: { type: string; status: "pending" | "done" }[];
}

export interface MeetingDetail extends Omit<MeetingSummary, "documents"> {
  transcript: string | null;
  documents: { type: string; status: "pending" | "done"; content: string | null; prompt: string | null }[];
}
