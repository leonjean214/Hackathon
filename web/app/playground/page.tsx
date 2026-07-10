"use client";

import { FormEvent, useEffect, useState } from "react";

type DeadlineStatus = "open" | "done" | "dismissed";

interface Deadline {
  id: string;
  title: string;
  due_date: string;
  description: string | null;
  confidence: number;
  status: DeadlineStatus;
}

interface Source {
  content: string;
  similarity: number;
}

function getErrorMessage(value: unknown): string {
  if (!value || typeof value !== "object") return "Request failed.";
  const error = (value as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : "Request failed.";
}

async function readJson(response: Response): Promise<unknown> {
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(getErrorMessage(payload));
  }

  return payload;
}

export default function PlaygroundPage() {
  const [ingestText, setIngestText] = useState("");
  const [ingestResult, setIngestResult] = useState<Deadline[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshDeadlines() {
    const payload = (await readJson(await fetch("/api/deadlines"))) as {
      deadlines?: Deadline[];
    };
    setDeadlines(payload.deadlines ?? []);
  }

  useEffect(() => {
    // Dev-only page: load the current backend state when the route opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshDeadlines().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Unable to load deadlines.");
    });
  }, []);

  async function handleIngest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("ingest");
    setError(null);

    try {
      const payload = (await readJson(
        await fetch("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: ingestText }),
        })
      )) as { deadlines?: Deadline[] };
      setIngestResult(payload.deadlines ?? []);
      await refreshDeadlines();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed.");
    } finally {
      setLoading(null);
    }
  }

  async function markDone(id: string) {
    setLoading(`done-${id}`);
    setError(null);

    try {
      await readJson(
        await fetch("/api/deadlines", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, status: "done" }),
        })
      );
      await refreshDeadlines();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deadline update failed.");
    } finally {
      setLoading(null);
    }
  }

  async function handleChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("chat");
    setError(null);

    try {
      const payload = (await readJson(
        await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
        })
      )) as { answer?: string; sources?: Source[] };
      setAnswer(payload.answer ?? "");
      setSources(payload.sources ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <p style={styles.kicker}>Dev Playground — not the real UI</p>
        <h1 style={styles.title}>Deadline Copilot API Playground</h1>
      </header>

      {error ? <div style={styles.error}>{error}</div> : null}

      <section style={styles.section}>
        <h2 style={styles.heading}>Ingest Text</h2>
        <form onSubmit={handleIngest} style={styles.stack}>
          <textarea
            value={ingestText}
            onChange={(event) => setIngestText(event.target.value)}
            placeholder="Paste text that contains one or more deadlines."
            rows={8}
            style={styles.textarea}
          />
          <button disabled={loading === "ingest" || !ingestText.trim()} style={styles.button}>
            {loading === "ingest" ? "Ingesting..." : "Ingest"}
          </button>
        </form>
        <pre style={styles.pre}>{JSON.stringify(ingestResult, null, 2)}</pre>
      </section>

      <section style={styles.section}>
        <div style={styles.row}>
          <h2 style={styles.heading}>Deadlines</h2>
          <button onClick={refreshDeadlines} style={styles.secondaryButton}>
            Refresh
          </button>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Due date</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Confidence</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {deadlines.map((deadline) => (
                <tr key={deadline.id}>
                  <td style={styles.td}>{deadline.title}</td>
                  <td style={styles.td}>{deadline.due_date}</td>
                  <td style={styles.td}>{deadline.status}</td>
                  <td style={styles.td}>{deadline.confidence.toFixed(2)}</td>
                  <td style={styles.td}>
                    <button
                      disabled={deadline.status === "done" || loading === `done-${deadline.id}`}
                      onClick={() => markDone(deadline.id)}
                      style={styles.secondaryButton}
                    >
                      Done
                    </button>
                  </td>
                </tr>
              ))}
              {deadlines.length === 0 ? (
                <tr>
                  <td colSpan={5} style={styles.empty}>
                    No deadlines found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>Chat</h2>
        <form onSubmit={handleChat} style={styles.chatForm}>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask about your deadlines."
            style={styles.input}
          />
          <button disabled={loading === "chat" || !message.trim()} style={styles.button}>
            {loading === "chat" ? "Sending..." : "Send"}
          </button>
        </form>
        {answer ? (
          <div style={styles.answer}>
            <strong>Answer</strong>
            <p>{answer}</p>
          </div>
        ) : null}
        {sources.length > 0 ? (
          <div style={styles.stack}>
            <strong>Sources</strong>
            {sources.map((source, index) => (
              <pre key={`${source.similarity}-${index}`} style={styles.pre}>
                {`Similarity: ${source.similarity.toFixed(3)}\n\n${source.content}`}
              </pre>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "32px",
    background: "#f8fafc",
    color: "#111827",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  header: {
    maxWidth: "1040px",
    margin: "0 auto 24px",
  },
  kicker: {
    margin: "0 0 6px",
    color: "#475569",
    fontSize: "14px",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    lineHeight: 1.2,
  },
  section: {
    maxWidth: "1040px",
    margin: "0 auto 20px",
    padding: "20px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    background: "#ffffff",
  },
  heading: {
    margin: "0 0 14px",
    fontSize: "20px",
  },
  stack: {
    display: "grid",
    gap: "12px",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  textarea: {
    width: "100%",
    resize: "vertical",
    padding: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    color: "#111827",
    background: "#ffffff",
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    color: "#111827",
    background: "#ffffff",
  },
  chatForm: {
    display: "flex",
    gap: "10px",
    marginBottom: "16px",
  },
  button: {
    width: "fit-content",
    padding: "10px 16px",
    border: 0,
    borderRadius: "6px",
    background: "#0f766e",
    color: "#ffffff",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "8px 12px",
    border: "1px solid #94a3b8",
    borderRadius: "6px",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
  },
  th: {
    padding: "10px",
    textAlign: "left",
    borderBottom: "1px solid #cbd5e1",
    color: "#334155",
  },
  td: {
    padding: "10px",
    borderBottom: "1px solid #e2e8f0",
    verticalAlign: "top",
  },
  empty: {
    padding: "16px 10px",
    color: "#64748b",
    textAlign: "center",
  },
  pre: {
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    padding: "12px",
    borderRadius: "6px",
    background: "#f1f5f9",
    color: "#0f172a",
    fontSize: "13px",
  },
  answer: {
    padding: "12px",
    marginBottom: "16px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#f8fafc",
  },
  error: {
    maxWidth: "1040px",
    margin: "0 auto 20px",
    padding: "12px",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    background: "#fef2f2",
    color: "#991b1b",
  },
};
