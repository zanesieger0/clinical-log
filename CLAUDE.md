# Project: Clinical Log

A private log of the user's clinical experiences (shadowing, patient encounters, volunteering,
etc.). The user is a medical student who dictates an experience to Claude in this folder (often
with Wispr Flow). Claude turns it into an entry and publishes it to a password-protected page on
GitHub Pages. They reread the entries later for residency applications, awards, and interviews.

The user is not a professional developer. Explain what you did in plain language. Their school
administration has approved logging these experiences.

## How the pieces fit

- `entries/*.json`: one file per entry, in plain text. **Local only**: git ignores this folder, and
  it must never be committed or pushed.
- `.site-password`: the page password. Local only, gitignored. Never print it, commit it, or
  put it in a commit message.
- `scripts/publish.mjs`: checks every entry, then encrypts all of them (AES-256-GCM, with the key
  derived from the password using PBKDF2-SHA256) into `docs/entries.enc.json`. Only this encrypted
  file is published.
- `docs/`: the website (plain HTML/CSS/JS, no build step). GitHub Pages serves this folder.
  The page asks for the password and decrypts entries in the browser.
- `scripts/restore.mjs`: rebuilds `entries/` from the encrypted file (for a new computer or a lost folder).

## Adding an entry (when the user dictates an experience)

1. Read the dictation and pull out the fields below. Use only what the user said; never invent
   details, outcomes, or feelings. Fix obvious transcription errors in medical terms.
2. **Required:** `date`, `type`, `specialty`, `site`. If any is missing or unclear, ask the user
   in one short message (e.g. "Which hospital was this at?") before writing the file.
   If preceptor or hours is missing for a clinical experience, ask once, combined with any
   required question, and mark it optional ("Who were you with and about how many hours? (optional)").
   If the user skips it, leave the field null. Ask about nothing else.
   - Resolve relative dates ("today", "yesterday", "Monday") against today's date. No date given = today.
   - Reuse the exact spelling of sites, preceptors, and specialties already in `entries/` when the
     user's shorthand matches one (e.g. "Presby" -> the saved "UPMC Presbyterian").
3. **Patient privacy, applied silently** (don't mention it to the user unless asked):
   no field may contain patient or family names or initials, room or bed numbers, MRNs, dates of
   birth, phone numbers, addresses, ages over 89, or any other identifying detail. Describe patients
   generically ("an older man"). Clinicians, staff, and the user may be named. In `dictation`, store
   the user's words with every such identifier replaced by `[patient]`, `[family member]`, `[room]`, etc.
4. Write `entries/<date>-<short-slug>.json`, using the format below.
5. Publish (below), then show the user the finished entry in chat, in this order: title, one
   details line, Summary, Key takeaways.

### Entry format (agreed with the user; keep exactly these sections)

```json
{
  "title": "ED Shadowing: Watching a New Heart Failure Diagnosis Delivered Well",
  "date": "2026-11-05",
  "type": "Shadowing",
  "specialty": "Emergency Medicine",
  "site": "UPMC Presbyterian",
  "preceptor": "Dr. Lee",
  "hours": 8,
  "summary": "3-5 sentences, first person, past tense: what the experience was and the one or two most notable moments. Concrete; no filler. A self-realization, if the user voiced one, may close it in one sentence.",
  "takeaways": [
    { "label": "Delivering a new diagnosis", "text": "One sentence." }
  ],
  "starred": false,
  "dictation": "The user's dictation with patient identifiers replaced."
}
```

- `type` must be one of: Shadowing, Patient encounter, Volunteering, Research, Leadership,
  Teaching, Other. ("Shadowing" = observing. "Patient encounter" = the user had a direct clinical role.)
- `title`: 4-10 words naming the setting and the most memorable part.
- `takeaways`: 3-6 items, each with a 2-4 word label and one sentence. Roughly in this order:
  clinical lessons/pearls, feedback received, procedures/skills, career insights, self-realizations.
- `preceptor` and `hours` may be null. `hours` must be computed from stated times, never guessed.
- The user explicitly removed these, so don't add them: application-use suggestions, competency tags,
  a "why it mattered" section, or any visible privacy-check notice.

## Editing, starring, removing

Edit or delete the file in `entries/`, then publish. "Star it" means set `"starred": true`.

## Publishing (after every change)

```bash
node scripts/publish.mjs
git add docs/entries.enc.json
git commit -m "Update entries"
git push
```

- Commit messages must stay generic ("Update entries"). The repository is public, so never put
  titles, names, sites, or any entry content in a commit message.
- If `publish.mjs` reports a possible identifier, fix the entry. Override with `--force` only if
  the user confirms it's a false alarm.
- The site updates about a minute after the push. Hard-refresh the page to see it.

## Never

- Commit anything in `entries/`, `.site-password`, or any plain-text entry content.
- Display or log the password.
- Add dependencies, build tools, or outside services without asking.
