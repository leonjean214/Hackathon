# Task: 后端第二批 — /api/chat + /api/deadlines + 最小可视 Playground

## Goal
在已 live 跑通的 ingest 基础上，补齐「对话检索」和「deadline 管理」接口，并加一个最小的 `/playground` 页面，让人能在浏览器 (localhost:3000/playground) 直接看到整条链路工作：贴文本→抽取 deadline→列表→对话问答。

## Context
- ingest 已 live 跑通（S3 / Bedrock Claude / Titan 1024 / CockroachDB）。
- 环境变量：`BEDROCK_CLAUDE_MODEL_ID`（现为 Sonnet 4.5）、`BEDROCK_TITAN_MODEL_ID`、`APP_USER_ID`（单用户）。
- 已有 lib：`db.ts`(query/withTransaction)、`bedrock.ts`(extractDeadlines/embed/toVectorLiteral)、`memory.ts`(chunkText/writeMemory)。
- 参考原型 echeo2（`~/Downloads/ep19-finalproject/echeo2`）：`src/app/api/chat/route.ts`、`src/lib/ai/agent.ts`、`supabase/migrations/0004_match_rpc.sql`（cosine 检索）。**法语一律改英文**，只借鉴思路不整包照抄。

## Requirements
1. `web/lib/bedrock.ts` 增 `answer(question: string, context: string): Promise<string>` — 调 Claude 生成英文回答，prompt 要求基于给定 context（检索到的记忆片段 + deadlines），无依据就说不知道，别编。
2. `web/lib/memory.ts` 增：
   - `searchChunks(userId, queryEmbedding: number[], k=6)` — cosine 检索 memory_chunks，返回 `{content, similarity}[]`，参数化 `$1::VECTOR(1024)`，按 `embedding <=> $1` 升序。
   - `openDeadlines(userId)` — 取 status='open' 按 due_date。
   - `recentMessages(userId, n=10)` — 最近对话。
3. `web/app/api/chat/route.ts` POST `{message}`：embed(message) → searchChunks + openDeadlines 组 context → `answer()` 生成 → 事务存 user+assistant 两条到 messages + agent_events('answer') → 返回 `{answer, sources:[{content,similarity}]}`。错误分类兜底。
4. `web/app/api/deadlines/route.ts`：
   - GET（可选 `?status=open`）：返回 deadlines 列表按 due_date 升序。
   - PATCH `{id, status}`：status ∈ open|done|dismissed，更新 status + updated_at；返回更新后的行。校验非法 status → 400。
5. `web/app/playground/page.tsx`（**独立路由，`"use client"`，纯功能最简样式，顶部标 "Dev Playground — not the real UI"**）：
   - 文本框 + Ingest 按钮 → POST /api/ingest（JSON text）→ 显示抽出的 deadlines。
   - Deadlines 区：GET /api/deadlines 渲染表格（title/due_date/status/confidence），每行一个 "Done" 按钮 → PATCH。
   - Chat 区：输入框 + Send → POST /api/chat → 显示 answer 和 sources。

## Constraints
- **不要碰** `web/app/page.tsx`、`web/app/layout.tsx`、`web/components/`（队友前端地盘）。playground 自成一路由。
- pg + 原生参数化 SQL，无 ORM。单用户 `APP_USER_ID`。所有 prompt / UI 文案英文。
- 向量检索 cosine `<=>` + `$n::VECTOR(1024)`。复用现有 lib，别重复造。

## Implementation Plan
1. lib/memory.ts 加 searchChunks/openDeadlines/recentMessages（先各写一句冒烟）。
2. lib/bedrock.ts 加 answer()。
3. api/chat 串起来；api/deadlines GET/PATCH。
4. playground 页面调这三个接口。
5. `npx tsc --noEmit` + `npm run lint` + `npm run test` 全过。

## Acceptance Criteria
- `npm run dev` 后 `POST /api/chat {"message":"When is my CAQ due?"}` 返回带 answer 的 JSON，answer 里含 2026-08-01，sources 非空。
- `GET /api/deadlines?status=open` 返回之前 ingest 的 deadline 列表。
- `PATCH /api/deadlines {id,status:"done"}` 后再 GET，该条 status=done。
- 浏览器打开 `localhost:3000/playground` 能完成：贴文本→看到 deadlines→点 Done→问一句得到回答。
- tsc / lint / vitest 全绿。

## Review Focus
- chat 的事务边界（user+assistant+event 一起写）。
- 向量检索 SQL 参数化与 cosine 方向（`<=>` 升序 = 最近）。
- context 拼接是否会超 token；answer 无依据时是否会编。
- playground 是否真的没碰 teammate 的文件。
- PATCH 的 status 校验与 SQL 注入面（参数化）。
