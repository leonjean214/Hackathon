import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { DeadlineRow } from "@/lib/memory";

export const runtime = "nodejs";

const VALID_STATUSES = new Set(["open", "done", "dismissed"]);

interface PatchPayload {
  id?: unknown;
  status?: unknown;
}

function jsonError(message: string, status: number, code: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function getUserId(): string {
  return process.env.APP_USER_ID || "00000000-0000-0000-0000-000000000001";
}

function isValidStatus(status: unknown): status is DeadlineRow["status"] {
  return typeof status === "string" && VALID_STATUSES.has(status);
}

function selectDeadlineSql(whereClause: string): string {
  return `SELECT
     id,
     title,
     due_date::STRING AS due_date,
     description,
     confidence,
     status,
     created_at::STRING AS created_at,
     updated_at::STRING AS updated_at
   FROM deadlines
   ${whereClause}
   ORDER BY due_date ASC, created_at ASC`;
}

export async function GET(request: Request): Promise<NextResponse> {
  const userId = getUserId();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  if (status && !VALID_STATUSES.has(status)) {
    return jsonError("status must be one of open, done, or dismissed.", 400, "INVALID_STATUS");
  }

  try {
    const result = status
      ? await query<DeadlineRow>(
          selectDeadlineSql("WHERE user_id = $1 AND status = $2"),
          [userId, status]
        )
      : await query<DeadlineRow>(selectDeadlineSql("WHERE user_id = $1"), [userId]);

    return NextResponse.json({ deadlines: result.rows });
  } catch (error) {
    return jsonError(
      `Deadline lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      500,
      "DEADLINE_LOOKUP_FAILED"
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const userId = getUserId();
  let payload: PatchPayload;

  try {
    payload = (await request.json()) as PatchPayload;
  } catch {
    return jsonError("Send a JSON body with id and status.", 400, "INVALID_DEADLINE_REQUEST");
  }

  if (typeof payload.id !== "string" || !payload.id.trim()) {
    return jsonError("id is required.", 400, "INVALID_DEADLINE_ID");
  }

  if (!isValidStatus(payload.status)) {
    return jsonError("status must be one of open, done, or dismissed.", 400, "INVALID_STATUS");
  }

  try {
    const result = await query<DeadlineRow>(
      `UPDATE deadlines
       SET status = $1, updated_at = now()
       WHERE id = $2 AND user_id = $3
       RETURNING
         id,
         title,
         due_date::STRING AS due_date,
         description,
         confidence,
         status,
         created_at::STRING AS created_at,
         updated_at::STRING AS updated_at`,
      [payload.status, payload.id.trim(), userId]
    );

    if (!result.rows[0]) {
      return jsonError("Deadline not found.", 404, "DEADLINE_NOT_FOUND");
    }

    return NextResponse.json({ deadline: result.rows[0] });
  } catch (error) {
    return jsonError(
      `Deadline update failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      500,
      "DEADLINE_UPDATE_FAILED"
    );
  }
}
