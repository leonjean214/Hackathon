import { Pool } from "pg";

interface DeadlineRow {
  id: string;
  title: string;
  due_date: string;
}

interface HandlerResult {
  scanned: number;
  remindersCreated: number;
  error?: string;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return pool;
}

function appUserId(): string {
  return process.env.APP_USER_ID || "00000000-0000-0000-0000-000000000001";
}

function reminderWindowDays(): number {
  const value = Number(process.env.REMINDER_WINDOW_DAYS || "30");
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(365, Math.trunc(value)));
}

function daysLeft(dueDate: string): number {
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dueUtc = Date.parse(`${dueDate}T00:00:00.000Z`);
  return Math.ceil((dueUtc - todayUtc) / 86_400_000);
}

async function scanOpenDeadlines(userId: string, windowDays: number): Promise<DeadlineRow[]> {
  const result = await getPool().query<DeadlineRow>(
    `SELECT id, title, due_date::STRING AS due_date
     FROM deadlines
     WHERE user_id = $1
       AND status = 'open'
       AND due_date >= current_date
       AND due_date <= current_date + $2::INT
       AND NOT EXISTS (
         SELECT 1
         FROM agent_events
         WHERE agent_events.user_id = deadlines.user_id
           AND event_type = 'remind'
           AND payload->>'deadlineId' = deadlines.id::STRING
           AND created_at >= current_date
           AND created_at < current_date + INTERVAL '1 day'
       )
     ORDER BY due_date ASC, created_at ASC`,
    [userId, windowDays]
  );

  return result.rows;
}

async function insertReminder(userId: string, deadline: DeadlineRow): Promise<boolean> {
  const payload = {
    deadlineId: deadline.id,
    title: deadline.title,
    dueDate: deadline.due_date,
    daysLeft: daysLeft(deadline.due_date),
  };

  const result = await getPool().query<{ id: string }>(
    `INSERT INTO agent_events (user_id, event_type, payload)
     SELECT $1, 'remind', $2::JSONB
     WHERE NOT EXISTS (
       SELECT 1
       FROM agent_events
       WHERE user_id = $1
         AND event_type = 'remind'
         AND payload->>'deadlineId' = $3
         AND created_at >= current_date
         AND created_at < current_date + INTERVAL '1 day'
     )
     RETURNING id`,
    [userId, JSON.stringify(payload), deadline.id]
  );

  return Boolean(result.rows[0]);
}

export const handler = async (): Promise<HandlerResult> => {
  try {
    const userId = appUserId();
    const deadlines = await scanOpenDeadlines(userId, reminderWindowDays());
    let remindersCreated = 0;

    for (const deadline of deadlines) {
      if (await insertReminder(userId, deadline)) {
        remindersCreated += 1;
      }
    }

    return { scanned: deadlines.length, remindersCreated };
  } catch (error) {
    return {
      scanned: 0,
      remindersCreated: 0,
      error: error instanceof Error ? error.message : "Unknown reminder agent error.",
    };
  }
};
