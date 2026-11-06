# Clinical Log

A password-protected page, hosted on GitHub Pages, holding summaries of my clinical experiences.
I dictate an experience to Claude in this folder. Claude writes the entry, encrypts it, and
publishes it to the page.

- **Adding, editing, or removing entries:** open Claude in this folder and talk to it.
  The rules Claude follows are in `CLAUDE.md`.
- **Reading:** open the page on any device and enter the password.

## Privacy

GitHub Pages sites are public, so everything is encrypted before upload:

| Where | What's there |
|---|---|
| This Mac only | `entries/` (plain-text entries) and `.site-password`. Git ignores both, so they are never uploaded. |
| GitHub (public) | The page's code and `docs/entries.enc.json`, which is unreadable without the password |
| Your phone/browser | Decrypts entries after you type the password. The password is never sent anywhere. |

Choose a strong password (12+ characters; a few random words works well). Anyone who has
the password and the link can read the entries.

**Backups:** the encrypted copy on GitHub is your backup. On a new computer, clone the
repository, recreate `.site-password` with `node scripts/set-password.mjs` (same password),
then run `node scripts/restore.mjs` to rebuild `entries/`.

## Files

```
CLAUDE.md                  How Claude adds, edits, removes, and publishes entries
entries/                   Plain-text entries, one .json file each (local only)
docs/                      The website GitHub Pages serves (index.html, app.js, style.css)
docs/entries.enc.json      The encrypted entries (created by publishing)
scripts/set-password.mjs   Set or change the page password (run in Terminal)
scripts/publish.mjs        Check and encrypt entries into docs/entries.enc.json
scripts/restore.mjs        Rebuild entries/ from the encrypted file
```
