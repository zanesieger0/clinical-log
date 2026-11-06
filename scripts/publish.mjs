// Checks every entry in entries/, then encrypts them all into docs/entries.enc.json.
//
//   node scripts/publish.mjs            normal use
//   node scripts/publish.mjs --force    publish even if a possible identifier was flagged
//
// (Testing only: --entries <folder> and --out <file> change where it reads and writes.)

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ENTRIES_DIR,
  ENCRYPTED_FILE,
  encryptJson,
  findPossibleIdentifiers,
  loadEntries,
  readPassword,
  validateEntry,
} from "./lib.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

export async function publish({ entriesDir = ENTRIES_DIR, outFile = ENCRYPTED_FILE, force = false } = {}) {
  const password = readPassword();
  const entries = loadEntries(entriesDir);

  // 1. Every entry must have the required fields in the right format.
  const errors = entries.flatMap((e) => validateEntry(e).map((p) => `${e.file}: ${p}`));
  if (errors.length) {
    throw new Error(`Fix these before publishing:\n  ${errors.join("\n  ")}`);
  }

  // 2. Second look for patient identifiers.
  const flags = entries.flatMap((e) => findPossibleIdentifiers(e).map((h) => `${e.file}: ${h}`));
  if (flags.length && !force) {
    throw new Error(
      `Possible patient identifiers found (nothing was published):\n  ${flags.join("\n  ")}\n` +
        `Fix them, or re-run with --force if these are false alarms.`,
    );
  }

  // 3. Newest first, then encrypt and write.
  const clean = entries
    .map(({ file, ...e }) => ({
      ...e,
      preceptor: e.preceptor ?? null,
      hours: e.hours ?? null,
      starred: e.starred ?? false,
      dictation: e.dictation ?? "",
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  const box = await encryptJson({ published: new Date().toISOString(), entries: clean }, password);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(box) + "\n");
  return { count: clean.length, flags };
}

// Run directly from the command line:
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { count, flags } = await publish({
      entriesDir: arg("--entries") ? path.resolve(arg("--entries")) : undefined,
      outFile: arg("--out") ? path.resolve(arg("--out")) : undefined,
      force: process.argv.includes("--force"),
    });
    if (flags.length) console.log(`Published despite ${flags.length} flag(s) (--force).`);
    console.log(`Encrypted ${count} ${count === 1 ? "entry" : "entries"} into docs/entries.enc.json.`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
