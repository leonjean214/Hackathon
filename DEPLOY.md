# Deploy — AWS Amplify Hosting

The web app (`web/`) is a Next.js 16 **SSR** app (has `/api/*` route handlers), so
it must run on Amplify's **WEB_COMPUTE** platform, not static hosting. Amplify
auto-detects this from the Next.js build output; `amplify.yml` (repo root) drives
the build.

> Prereq: whoever connects the repo in the Amplify console needs **Admin** on
> `github.com/leonjean214/Hackathon` to install the *AWS Amplify* GitHub App.
> Amplify runs in the teammate's AWS account, so **SANABI-LL** must accept the
> pending Admin invitation first.

---

## 1. Connect the repo (Amplify console)

1. AWS Console → **Amplify** → **Create new app** → **GitHub** → authorize +
   install the *AWS Amplify* GitHub App on `leonjean214/Hackathon`.
2. Branch: `main`.
3. **Monorepo**: enable it and set **App root directory = `web`**
   (must match `appRoot: web` in `amplify.yml`).
4. Amplify should detect **Next.js (SSR)** and pick `amplify.yml` automatically.

## 2. Region

Deploy the Amplify app in **`us-east-2`** — same region as the S3 bucket and
Bedrock. The SSR compute auto-injects `AWS_REGION`, so matching the region means
the Bedrock/S3 clients (which read `process.env.AWS_REGION`) resolve correctly
even if you can't set `AWS_REGION` manually (it's a reserved runtime name).

## 3. Environment variables

Set these under **App settings → Environment variables**. They are passed to the
SSR compute at runtime.

| Name                     | Value                                                  | Notes |
|--------------------------|--------------------------------------------------------|-------|
| `DATABASE_URL`           | *(copy from `web/.env.local` — do NOT commit)*         | **Secret.** CockroachDB `spunky-llama-28799`, `sslmode=verify-full`. |
| `S3_BUCKET`              | `deadline-copilot-docs-938050482316`                   | |
| `BEDROCK_CLAUDE_MODEL_ID`| `us.anthropic.claude-sonnet-4-5-20250929-v1:0`         | us-east-2 cross-region inference profile. |
| `BEDROCK_TITAN_MODEL_ID` | `amazon.titan-embed-text-v2:0`                         | 1024-dim embeddings. |
| `APP_USER_ID`            | `00000000-0000-0000-0000-000000000001`                 | Single demo user. |
| `AWS_REGION`             | `us-east-2`                                            | Set if the console allows; otherwise rely on step 2 (auto-injected). |

**Do NOT set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.** Use the compute
role in step 4 instead — the SDK clients construct with region only and fall
through to the default credential provider chain (the attached role).

## 4. IAM: compute service role (Bedrock + S3)

The Bedrock and S3 clients pass **no explicit credentials**, so they use the
Amplify SSR **compute role**. In the Amplify console: **App settings → IAM roles
→ Compute role** → attach a role whose policy allows:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Bedrock",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": [
        "arn:aws:bedrock:us-east-2::foundation-model/amazon.titan-embed-text-v2:0",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5-*",
        "arn:aws:bedrock:us-east-2:938050482316:inference-profile/us.anthropic.claude-sonnet-4-5-*"
      ]
    },
    {
      "Sid": "S3Docs",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::deadline-copilot-docs-938050482316/*"
    }
  ]
}
```

> The Claude model is invoked via a **cross-region inference profile**
> (`us.` prefix), which fans out to multiple regions — hence the wildcard
> `foundation-model` ARN plus the `inference-profile` ARN. Tighten later if
> Bedrock denies a specific region.

## 5. Deploy & verify

1. Trigger the build (auto on push to `main`, or **Redeploy this version**).
2. Once green, hit the Amplify URL:
   - `GET /playground` — dev test page loads.
   - `POST /api/ingest` with a small PDF → 200 + extracted deadlines.
   - `POST /api/chat` → grounded answer citing stored deadlines.
3. If ingest/chat 500s: check the compute role (step 4) and that Bedrock model
   access is granted for this account in **us-east-2**.

## Notes / gotchas

- **Node version**: `amplify.yml` pins Node 20 (Next 16 requires ≥ 20).
- **`maxDuration`**: ingest route is sync; Amplify SSR compute default timeout is
  generous, but very large docs may need tuning.
- **CockroachDB `sslmode=verify-full`** works from Amplify compute — no extra CA
  config needed (Cloud cert is public-CA signed).
- Amplify env vars are **not** the same as the Lambda agent env (`agent/README.md`
  has the reminder + KB-refresh Lambda deployment separately).
