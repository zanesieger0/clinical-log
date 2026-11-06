// Clinical Log: the web page.
// 1. Downloads entries.enc.json (your entries, encrypted).
// 2. Asks for your password and decrypts the entries here in the browser.
//    The password never leaves your phone.
// 3. Shows the Library (search + filters) and each entry's page.

"use strict";

const PASSWORD_KEY = "clinical-log:password";
const ENTRY_TYPES = ["Shadowing", "Patient encounter", "Volunteering", "Research", "Leadership", "Teaching", "Other"];

const state = {
  entries: [],
  published: null,
  filters: { q: "", type: "", specialty: "", starred: false, from: "", to: "" },
  libraryScroll: 0,
};

const app = document.getElementById("app");
const lockButton = document.getElementById("lock-button");

// ---------- Small helpers ----------

// Builds page elements safely (text is never interpreted as HTML).
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "value") node.value = value;
    else if (key === "checked") node.checked = value;
    else if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

function formatDate(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatHours(h) {
  if (h === null || h === undefined) return null;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? "hour" : "hours"}`;
}

const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// ---------- Loading and decrypting ----------

async function loadEncryptedFile() {
  const res = await fetch(`entries.enc.json?v=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) return null; // nothing published yet
  if (!res.ok) throw new Error(`Couldn't download entries (error ${res.status}).`);
  return res.json();
}

async function decrypt(box, password) {
  const subtle = window.crypto.subtle;
  const base = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(box.salt), iterations: box.iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await subtle.decrypt({ name: "AES-GCM", iv: fromBase64(box.iv) }, key, fromBase64(box.data));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function savedPassword() {
  return localStorage.getItem(PASSWORD_KEY) || sessionStorage.getItem(PASSWORD_KEY);
}

function forgetPassword() {
  localStorage.removeItem(PASSWORD_KEY);
  sessionStorage.removeItem(PASSWORD_KEY);
}

// ---------- Screens ----------

function showMessage(title, text) {
  app.replaceChildren(el("section", { class: "login" }, el("h1", {}, title), el("p", { class: "muted" }, text)));
}

function showLock(box, errorText) {
  lockButton.hidden = true;
  const input = el("input", { type: "password", id: "password", autocomplete: "current-password", required: true });
  const remember = el("input", { type: "checkbox", id: "remember", checked: true });
  const error = el("p", { class: "error", role: "alert" }, errorText || "");
  const button = el("button", { type: "submit", class: "primary big" }, "Unlock");

  const form = el(
    "form",
    {
      class: "form",
      onsubmit: async (event) => {
        event.preventDefault();
        button.disabled = true;
        button.textContent = "Unlocking…";
        error.textContent = "";
        try {
          const data = await decrypt(box, input.value);
          (remember.checked ? localStorage : sessionStorage).setItem(PASSWORD_KEY, input.value);
          start(data);
        } catch {
          error.textContent = "Wrong password.";
          button.disabled = false;
          button.textContent = "Unlock";
          input.select();
        }
      },
    },
    el("label", { for: "password" }, "Password"),
    input,
    el("label", { class: "check" }, remember, "Stay unlocked on this device"),
    error,
    button,
  );
  app.replaceChildren(el("section", { class: "login" }, el("h1", {}, "Clinical Log"), form));
  input.focus();
}

function start(data) {
  state.entries = data.entries || [];
  state.published = data.published || null;
  lockButton.hidden = false;
  route();
}

// Which screen to show, based on the address (#/ = Library, #/e/<id> = one entry).
function route() {
  const match = location.hash.match(/^#\/e\/(.+)$/);
  if (match) {
    const entry = state.entries.find((e) => e.id === decodeURIComponent(match[1]));
    if (entry) return renderEntry(entry);
  }
  renderLibrary();
}

// ---------- Library ----------

function matchesFilters(e) {
  const f = state.filters;
  if (f.type && e.type !== f.type) return false;
  if (f.specialty && e.specialty !== f.specialty) return false;
  if (f.starred && !e.starred) return false;
  if (f.from && e.date < f.from) return false;
  if (f.to && e.date > f.to) return false;
  if (f.q) {
    const haystack = [e.title, e.type, e.specialty, e.site, e.preceptor, e.summary, ...(e.takeaways || []).flatMap((t) => [t.label, t.text])]
      .join(" ")
      .toLowerCase();
    // Every word typed must appear somewhere in the entry.
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

function renderLibrary() {
  const f = state.filters;
  const specialties = [...new Set(state.entries.map((e) => e.specialty))].sort();
  const list = el("ul", { class: "cards" });
  const count = el("p", { class: "muted count" });

  const update = () => {
    const shown = state.entries.filter(matchesFilters);
    const filtered = f.q || f.type || f.specialty || f.starred || f.from || f.to;
    count.replaceChildren(
      `${shown.length} ${shown.length === 1 ? "entry" : "entries"}`,
      filtered ? " · " : "",
      filtered
        ? el("button", { class: "link", onclick: () => { Object.assign(f, { q: "", type: "", specialty: "", starred: false, from: "", to: "" }); renderLibrary(); } }, "Clear filters")
        : "",
    );
    list.replaceChildren(
      ...shown.map((e) =>
        el(
          "li",
          {},
          el(
            "a",
            { class: "card", href: `#/e/${encodeURIComponent(e.id)}`, onclick: () => { state.libraryScroll = window.scrollY; } },
            el("div", { class: "card-top" }, el("span", {}, formatDate(e.date)), e.starred ? el("span", { "aria-label": "starred" }, "⭐") : null),
            el("div", { class: "card-title" }, e.title),
            el("div", { class: "card-meta" }, el("span", { class: "chip" }, e.type), ` ${e.specialty} · ${e.site}`),
            el("p", { class: "card-summary" }, e.summary),
          ),
        ),
      ),
    );
    if (shown.length === 0) {
      list.append(
        el("li", { class: "muted" }, state.entries.length ? "No entries match these filters." : "No entries yet. Dictate one to Claude in the clinical-log folder."),
      );
    }
  };

  const select = (name, label, options) =>
    el(
      "select",
      { "aria-label": label, onchange: (ev) => { f[name] = ev.target.value; update(); } },
      el("option", { value: "" }, label),
      options.map((o) => el("option", { value: o, selected: f[name] === o }, o)),
    );

  const filters = el(
    "div",
    { class: "filters" },
    el("input", {
      type: "search",
      placeholder: "Search summaries and takeaways…",
      value: f.q,
      oninput: (ev) => { f.q = ev.target.value.trim(); update(); },
    }),
    el(
      "div",
      { class: "row" },
      select("type", "All types", ENTRY_TYPES),
      select("specialty", "All specialties", specialties),
      el("label", { class: "check" }, el("input", { type: "checkbox", checked: f.starred, onchange: (ev) => { f.starred = ev.target.checked; update(); } }), "⭐ only"),
    ),
    el(
      "details",
      { open: Boolean(f.from || f.to) },
      el("summary", {}, "Date range"),
      el(
        "div",
        { class: "row" },
        el("label", {}, "From", el("input", { type: "date", value: f.from, onchange: (ev) => { f.from = ev.target.value; update(); } })),
        el("label", {}, "To", el("input", { type: "date", value: f.to, onchange: (ev) => { f.to = ev.target.value; update(); } })),
      ),
    ),
  );

  const footer = el("p", { class: "muted footer" }, state.published ? `Last published ${new Date(state.published).toLocaleString()}` : "");

  app.replaceChildren(el("section", {}, el("h1", {}, "Library"), filters, count, list, footer));
  update();
  window.scrollTo(0, state.libraryScroll);
}

// ---------- One entry ----------

function detail(label, value) {
  return value ? el("span", { class: "detail" }, el("b", {}, `${label}:`), ` ${value}`) : null;
}

function renderEntry(e) {
  window.scrollTo(0, 0);
  app.replaceChildren(
    el(
      "section",
      {},
      el("div", { class: "actions top" }, el("a", { href: "#/" }, "← Library"), e.starred ? el("span", {}, "⭐ Starred") : null),
      el(
        "article",
        { class: "entry" },
        el("h1", { class: "entry-title" }, e.title),
        el(
          "div",
          { class: "details" },
          el("span", { class: "detail" }, `📅 ${formatDate(e.date)}`),
          detail("Type", e.type),
          detail("Specialty", e.specialty),
          detail("Site", e.site),
          detail("Preceptor", e.preceptor),
          detail("Hours", formatHours(e.hours)),
        ),
        el("h2", {}, "Summary"),
        el("p", { class: "summary" }, e.summary),
        e.takeaways && e.takeaways.length
          ? [el("h2", {}, "Key takeaways"), el("ul", { class: "takeaways" }, e.takeaways.map((t) => el("li", {}, el("b", {}, `${t.label}:`), ` ${t.text}`)))]
          : null,
      ),
      e.dictation ? el("details", { class: "dictation-original" }, el("summary", {}, "Original dictation"), el("p", {}, e.dictation)) : null,
    ),
  );
}

// ---------- Start up ----------

lockButton.addEventListener("click", () => {
  forgetPassword();
  location.hash = "";
  location.reload();
});
window.addEventListener("hashchange", () => {
  if (state.entries.length || lockButton.hidden === false) route();
});

(async () => {
  if (!window.crypto?.subtle) {
    return showMessage("Can't unlock here", "This page must be opened over https (it works on GitHub Pages).");
  }
  let box;
  try {
    box = await loadEncryptedFile();
  } catch (err) {
    return showMessage("Couldn't load", `${err.message} Check your connection and refresh.`);
  }
  if (!box) {
    return showMessage("Nothing published yet", "Entries will appear here after Claude publishes the first one.");
  }
  const pw = savedPassword();
  if (pw) {
    try {
      return start(await decrypt(box, pw));
    } catch {
      forgetPassword(); // the password changed since last time
      return showLock(box, "The password has changed. Enter the new one.");
    }
  }
  showLock(box);
})();
