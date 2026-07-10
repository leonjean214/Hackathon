"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

interface CalendarDay {
  date: Date;
  key: string;
  inCurrentMonth: boolean;
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

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deadlineDateKey(dueDate: string): string {
  return dueDate.slice(0, 10);
}

function buildCalendarDays(monthStart: Date): CalendarDay[] {
  const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  const gridEnd = new Date(lastDay);
  gridEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

  const days: CalendarDay[] = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    days.push({
      date: new Date(cursor),
      key: toDateKey(cursor),
      inCurrentMonth: cursor.getMonth() === monthStart.getMonth(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function statusDotClass(status: DeadlineStatus): string {
  if (status === "done") return "bg-emerald-600";
  if (status === "dismissed") return "bg-slate-400";
  return "bg-amber-500";
}

function MonthCalendar({
  deadlines,
  monthStart,
  onPreviousMonth,
  onNextMonth,
}: {
  deadlines: Deadline[];
  monthStart: Date;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
}) {
  const todayKey = toDateKey(new Date());
  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const days = useMemo(() => buildCalendarDays(monthStart), [monthStart]);
  const deadlinesByDate = useMemo(() => {
    const grouped = new Map<string, Deadline[]>();

    for (const deadline of deadlines) {
      const key = deadlineDateKey(deadline.due_date);
      const dayDeadlines = grouped.get(key) ?? [];
      dayDeadlines.push(deadline);
      grouped.set(key, dayDeadlines);
    }

    return grouped;
  }, [deadlines]);

  return (
    <section style={styles.section}>
      <div style={styles.row}>
        <h2 style={styles.heading}>Calendar</h2>
        <div className="flex items-center gap-2">
          <button onClick={onPreviousMonth} style={styles.secondaryButton}>
            ‹ Prev
          </button>
          <strong className="min-w-36 text-center text-sm">{monthLabel}</strong>
          <button onClick={onNextMonth} style={styles.secondaryButton}>
            Next ›
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 border-l border-t border-slate-200 text-sm">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
          <div
            key={weekday}
            className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600"
          >
            {weekday}
          </div>
        ))}
        {days.map((day) => {
          const dayDeadlines = day.inCurrentMonth ? deadlinesByDate.get(day.key) ?? [] : [];
          const visibleDeadlines = dayDeadlines.slice(0, 3);
          const extraCount = dayDeadlines.length - visibleDeadlines.length;
          const isToday = day.key === todayKey;

          return (
            <div
              key={day.key}
              className={[
                "min-h-28 border-b border-r border-slate-200 p-2",
                day.inCurrentMonth ? "bg-white" : "bg-slate-50 text-slate-400",
                isToday ? "ring-2 ring-inset ring-teal-500" : "",
              ].join(" ")}
            >
              <div className="mb-2 text-xs font-semibold">{day.date.getDate()}</div>
              <div className="grid gap-1">
                {visibleDeadlines.map((deadline) => (
                  <div
                    key={deadline.id}
                    title={deadline.title}
                    className="flex items-center gap-1 truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-800"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(deadline.status)}`}
                    />
                    <span className="truncate">{deadline.title}</span>
                  </div>
                ))}
                {extraCount > 0 ? (
                  <div className="text-xs text-slate-500">+{extraCount}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function PlaygroundPage() {
  const [ingestText, setIngestText] = useState("");
  const [ingestResult, setIngestResult] = useState<Deadline[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
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

  function changeCalendarMonth(offset: number) {
    setCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
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

      <MonthCalendar
        deadlines={deadlines}
        monthStart={calendarMonth}
        onPreviousMonth={() => changeCalendarMonth(-1)}
        onNextMonth={() => changeCalendarMonth(1)}
      />

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
