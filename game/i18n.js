// Translations keyed by the game's English text, which stays the fallback for a missing entry.
// main.js loads the table before the game's modules, which translate their text as they evaluate.
const SETTINGS_KEY = "far-door-settings";

export const LANGUAGES = [
  { id: "en", name: "English" },
  { id: "fr", name: "Français" },
  { id: "es", name: "Español" },
  { id: "zh", name: "中文" },
  { id: "hi", name: "हिन्दी" },
];

const TABLES = {
  fr: () => import("./i18n/fr.js"),
  es: () => import("./i18n/es.js"),
  zh: () => import("./i18n/zh.js"),
  hi: () => import("./i18n/hi.js"),
};

let table = null;
export let language = "en";

export function t(text, values) {
  const out = table?.[text] ?? text;
  if (!values) return out;
  return out.replace(/\{(\w+)\}/g, (all, key) =>
    key in values ? String(values[key]) : all,
  );
}

const supported = (id) => LANGUAGES.some((entry) => entry.id === id);

// A `lang` query, the player's saved choice, then the browser's languages. Automated sessions
// keep English, so checks that read the game's text read its source.
export function chooseLanguage() {
  const asked = new URLSearchParams(location.search).get("lang");
  if (supported(asked)) return asked;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").language;
  } catch {
    /* storage unavailable */
  }
  if (supported(saved)) return saved;
  return browserLanguage();
}

// What Automatic means: the browser's first supported language.
export function browserLanguage() {
  if (navigator.webdriver) return "en";
  for (const tag of navigator.languages || [navigator.language]) {
    const id = String(tag).toLowerCase().split("-")[0];
    if (supported(id)) return id;
  }
  return "en";
}

export async function loadLanguage(id = chooseLanguage()) {
  try {
    table = TABLES[id] ? (await TABLES[id]()).default : null;
    language = id;
  } catch (error) {
    console.error(error);
    table = null;
    language = "en";
  }
  document.documentElement.lang = language === "zh" ? "zh-Hans" : language;
  return language;
}

const ATTRIBUTES = ["aria-label", "title", "alt", "placeholder"];

// The page's own text. Elements marked `data-i18n` translate their markup whole, so a sentence
// split by inline tags can change its word order; `translate="no"` keeps names as written.
export function translatePage(root = document.body) {
  if (!table) return;
  const key = (text) => text.replace(/\s+/g, " ").trim();
  for (const element of root.querySelectorAll("[data-i18n]")) {
    const html = table[key(element.innerHTML)];
    if (html) element.innerHTML = html;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement.closest("script, style, [data-i18n], [translate=no]")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = table[key(node.nodeValue)];
    if (text) node.nodeValue = node.nodeValue.replace(/\S(.*\S)?/s, () => text);
  }
  for (const name of ATTRIBUTES)
    for (const element of root.querySelectorAll(`[${name}]`)) {
      const text = table[key(element.getAttribute(name))];
      if (text) element.setAttribute(name, text);
    }
}
