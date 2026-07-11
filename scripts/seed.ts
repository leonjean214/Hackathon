import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { extractDeadlines } from "../web/lib/bedrock";
import { writeMemory } from "../web/lib/memory";

interface SeedDocument {
  fileName: string;
  text: string;
}

function loadWebEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "web/.env.local"),
    resolve(process.cwd(), "../web/.env.local"),
  ];
  const envPath = candidates.find((candidate) => existsSync(candidate));
  if (!envPath) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const userId = () =>
  process.env.APP_USER_ID || "00000000-0000-0000-0000-000000000001";

const samples: SeedDocument[] = [
  {
    fileName: "ircc-study-permit-expiry-email.txt",
    text: [
      "Subject: Study permit expiry reminder",
      "From: Immigration, Refugees and Citizenship Canada",
      "",
      "Our records show that your study permit will expire on 2026-09-30.",
      "If you plan to continue studying in Canada, submit your extension application before the expiry date. Keep proof of submission for your school and employer.",
      "This notice is informational and does not replace the conditions printed on your permit.",
    ].join("\n"),
  },
  {
    fileName: "quebec-caq-renewal-notice.txt",
    text: [
      "Subject: Quebec Acceptance Certificate renewal notice",
      "Quebec immigration received your student file update.",
      "Your current CAQ for studies expires on 2026-08-15.",
      "Upload the missing proof of financial capacity no later than 2026-07-31 to avoid processing delays.",
      "Include your application number on every uploaded document.",
    ].join("\n"),
  },
  {
    fileName: "work-permit-document-checklist.txt",
    text: [
      "Subject: Work permit document checklist",
      "Your post-graduation work permit application is in progress.",
      "The temporary public policy work authorization letter is valid until 2026-10-20.",
      "You must provide biometrics by 2026-08-05 if you have not given biometrics in the last ten years.",
      "Failure to provide biometrics by the deadline may result in refusal.",
    ].join("\n"),
  },
  {
    fileName: "ircc-passport-request.txt",
    text: [
      "Subject: Passport request for temporary resident visa",
      "We are ready to finalize your application.",
      "Submit your passport or passport photocopy package within 30 days. The package must be received by 2026-07-25.",
      "Your medical exam validity expires on 2026-11-12. Travel must occur before the validity date shown on the visa counterfoil.",
    ].join("\n"),
  },
];

async function main(): Promise<void> {
  loadWebEnv();

  for (const sample of samples) {
    const deadlines = await extractDeadlines(sample.text);
    const result = await writeMemory({
      userId: userId(),
      text: sample.text,
      sourceType: "text",
      fileName: sample.fileName,
      mimeType: "text/plain",
      s3Bucket: "seed",
      s3Key: `seed/${sample.fileName}`,
      deadlines,
    });

    console.log(
      `${sample.fileName}: document ${result.documentId}, ${result.deadlines.length} deadlines`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
