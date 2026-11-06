// Sets (or changes) the password for the website, then re-encrypts the entries with it.
// Run in Terminal:   node scripts/set-password.mjs
// What you type is hidden. The password is saved in .site-password (never uploaded).

import { writeFileSync, chmodSync } from "node:fs";
import { PASSWORD_FILE } from "./lib.mjs";
import { publish } from "./publish.mjs";

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      console.error("Run this in Terminal so the password can be typed privately.");
      process.exit(1);
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let input = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(input);
          return;
        } else if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(1); // Ctrl+C
        } else if (ch === "\u007f" || ch === "\b") {
          input = input.slice(0, -1);
        } else {
          input += ch;
        }
      }
    };
    stdin.on("data", onData);
  });
}

const first = await askHidden("New website password (12+ characters, typing is hidden): ");
if (first.length < 12) {
  console.error("Too short. Use at least 12 characters; a few random words works well.");
  process.exit(1);
}
const second = await askHidden("Type it again: ");
if (first !== second) {
  console.error("The two didn't match. Nothing was changed.");
  process.exit(1);
}

writeFileSync(PASSWORD_FILE, first + "\n");
chmodSync(PASSWORD_FILE, 0o600); // only your Mac user account can read it

try {
  const { count } = await publish();
  console.log(`Password saved. Re-encrypted ${count} ${count === 1 ? "entry" : "entries"} with it.`);
  console.log("Tell Claude to publish (or run: git add docs && git commit -m 'Update entries' && git push).");
} catch (e) {
  console.log("Password saved.");
  console.error(e.message);
}
