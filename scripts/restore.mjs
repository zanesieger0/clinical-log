// Rebuilds the entries/ folder from the encrypted copy on the website
// (for example on a new computer, after cloning the repository).
//
//   node scripts/restore.mjs              writes entries that don't exist yet
//   node scripts/restore.mjs --overwrite  also replaces existing entry files

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENCRYPTED_FILE, ENTRIES_DIR, decryptJson, readPassword } from "./lib.mjs";

const overwrite = process.argv.includes("--overwrite");

try {
  const box = JSON.parse(readFileSync(ENCRYPTED_FILE, "utf8"));
  const { entries } = await decryptJson(box, readPassword());
  mkdirSync(ENTRIES_DIR, { recursive: true });
  let written = 0;
  for (const { id, ...entry } of entries) {
    const file = path.join(ENTRIES_DIR, `${id}.json`);
    if (existsSync(file) && !overwrite) continue;
    writeFileSync(file, JSON.stringify(entry, null, 2) + "\n");
    written++;
  }
  console.log(`Restored ${written} of ${entries.length} entries into entries/.`);
} catch (e) {
  console.error(
    e.name === "OperationError" ? "Wrong password for the encrypted file." : e.message,
  );
  process.exit(1);
}
