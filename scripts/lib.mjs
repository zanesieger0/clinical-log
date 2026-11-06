// Shared helpers for the publish / restore / set-password scripts.
// Uses only Node's built-in tools; no packages to install.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENTRIES_DIR = path.join(ROOT, "entries");
export const ENCRYPTED_FILE = path.join(ROOT, "docs", "entries.enc.json");
export const PASSWORD_FILE = path.join(ROOT, ".site-password");

export const ENTRY_TYPES = [
  "Shadowing",
  "Patient encounter",
  "Volunteering",
  "Research",
  "Leadership",
  "Teaching",
  "Other",
];

// How hard the password is to brute-force. Higher = safer but slower to unlock.
const ITERATIONS = 600000;

// ---------- Password ----------

export function readPassword() {
  if (process.env.SITE_PASSWORD) return process.env.SITE_PASSWORD;
  if (existsSync(PASSWORD_FILE)) {
    const pw = readFileSync(PASSWORD_FILE, "utf8").replace(/\r?\n$/, "");
    if (pw) return pw;
  }
  throw new Error(
    "No site password set yet. In Terminal, run:\n  node scripts/set-password.mjs",
  );
}

// ---------- Reading and checking entries ----------

export function loadEntries(dir = ENTRIES_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const raw = readFileSync(path.join(dir, file), "utf8");
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        throw new Error(`${file}: not valid JSON (${e.message})`);
      }
      return { id: file.replace(/\.json$/, ""), file, ...data };
    });
}

// Returns a list of problems (empty list = entry is fine).
export function validateEntry(e) {
  const problems = [];
  const need = (field) => {
    if (typeof e[field] !== "string" || e[field].trim() === "") problems.push(`missing "${field}"`);
  };
  ["title", "date", "type", "specialty", "site", "summary"].forEach(need);
  if (typeof e.date === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
    problems.push(`"date" must look like 2026-11-05`);
  } else if (typeof e.date === "string" && Number.isNaN(new Date(`${e.date}T12:00:00Z`).getTime())) {
    problems.push(`"date" is not a real date`);
  }
  if (typeof e.type === "string" && !ENTRY_TYPES.includes(e.type)) {
    problems.push(`"type" must be one of: ${ENTRY_TYPES.join(", ")}`);
  }
  if (!(e.preceptor === null || e.preceptor === undefined || typeof e.preceptor === "string")) {
    problems.push(`"preceptor" must be text or null`);
  }
  if (!(e.hours === null || e.hours === undefined || (typeof e.hours === "number" && e.hours >= 0 && e.hours <= 48))) {
    problems.push(`"hours" must be a number from 0 to 48, or null`);
  }
  if (!Array.isArray(e.takeaways) || e.takeaways.some((t) => typeof t?.label !== "string" || typeof t?.text !== "string")) {
    problems.push(`"takeaways" must be a list of {"label", "text"}`);
  }
  if (e.starred !== undefined && typeof e.starred !== "boolean") problems.push(`"starred" must be true or false`);
  if (e.dictation !== undefined && e.dictation !== null && typeof e.dictation !== "string") {
    problems.push(`"dictation" must be text`);
  }
  return problems;
}

// A safety net for patient identifiers that slipped through. It can't catch everything;
// it flags common patterns so they get a second look before publishing.
const IDENTIFIER_PATTERNS = [
  [/\b(room|rm|bed)\s*#?\s*\d+/i, "room or bed number"],
  [/\bMRN\b|\bmedical record (number|#)/i, "medical record number"],
  [/\b(DOB|date of birth|born on)\b/i, "date of birth"],
  [/\b(Mr|Mrs|Ms|Miss|Mx)\.?\s+[A-Z][a-z]+/, "a patient-style name (Mr./Mrs./Ms. ...)"],
  [/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/, "phone number"],
  [/\b(9\d|1[01]\d)[- ]?(year[- ]old|yo|y\/o)\b/i, "age over 89"],
];

export function findPossibleIdentifiers(e) {
  const hits = [];
  const fields = {
    title: e.title,
    summary: e.summary,
    dictation: e.dictation,
    takeaways: (e.takeaways ?? []).map((t) => `${t.label} ${t.text}`).join(" "),
  };
  for (const [field, text] of Object.entries(fields)) {
    if (typeof text !== "string") continue;
    for (const [pattern, label] of IDENTIFIER_PATTERNS) {
      const m = text.match(pattern);
      if (m) hits.push(`${field}: looks like ${label} ("${m[0]}")`);
    }
  }
  return hits;
}

// ---------- Encryption (same method the web page uses to decrypt) ----------

const { subtle } = globalThis.crypto;
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

async function deriveKey(password, salt, iterations, usage) {
  const base = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export async function encryptJson(value, password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS, "encrypt");
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(ciphertext),
  };
}

export async function decryptJson(box, password) {
  const key = await deriveKey(password, unb64(box.salt), box.iterations, "decrypt");
  const plaintext = await subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.data));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
