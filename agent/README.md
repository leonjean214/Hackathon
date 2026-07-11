# Deadline Reminder Lambda

Deploy `handler.ts` as the daily reminder Lambda handler. Package this directory with its `pg` dependency, set `DATABASE_URL` and `APP_USER_ID`, and optionally set `REMINDER_WINDOW_DAYS` to override the default 30 day scan window.

Recommended trigger: EventBridge Scheduler or EventBridge Rule with a daily cron expression. The handler scans open deadlines due from today through the configured window and inserts one `agent_events('remind')` row per deadline per calendar day.
