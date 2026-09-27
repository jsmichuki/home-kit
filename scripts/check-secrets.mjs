#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  ["Paystack secret key", /\bsk_(?:test|live)_[A-Za-z0-9_-]{16,}\b/g],
  ["Resend API key", /\bre_[A-Za-z0-9]{20,}\b/g],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub personal access token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
];

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean);

const findings = [];

for (const file of trackedFiles) {
  if (file.startsWith(".git/") || file.endsWith(".lock")) {
    continue;
  }

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const [label, pattern] of patterns) {
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split("\n").length;
      findings.push(`${file}:${line}: potential ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed. Remove or rotate the detected credential, then retry.");
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Secret scan passed: no supported credential patterns found in tracked files.");
}
