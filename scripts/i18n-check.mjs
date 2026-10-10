// Lists the game's translatable text (literal `t()` keys in its modules and the page's own text)
// and checks every language table: complete, nothing stale, same placeholders and tags.
//   node scripts/i18n-check.mjs [--write=<strings.json>] [--candidates]
// `--candidates` prints literals that read like English prose but are not translated yet.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parsers } from "prettier/plugins/acorn";

const root = path.resolve(import.meta.dirname, "../game");
const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const LANGUAGES = ["fr", "es", "zh", "hi"];
// Developer tools stay in English: the asset lab, the character studio and local test links.
const SKIP = new Set([
  "vendor",
  "i18n",
  "i18n.js",
  "asset-lab.js",
  "character-view.js",
  "lab-equipment.js",
  "asset-catalog.js",
  "local-preview.js",
]);

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(full)));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function unescape(body, quote) {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|.)/gs, (all, c) => {
    if (c[0] === "u" && c.length > 1)
      return String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ""), 16));
    return { n: "\n", t: "\t", "\n": "" }[c] ?? c;
  });
}

// Names a node binds for its own scope: parameters, declarations in its body, loop heads.
function bound(node) {
  const names = new Set();
  const pattern = (p) => {
    if (!p) return;
    if (p.type === "Identifier") names.add(p.name);
    else if (p.type === "ObjectPattern")
      p.properties.forEach((q) => pattern(q.value ?? q.argument));
    else if (p.type === "ArrayPattern") p.elements.forEach(pattern);
    else if (p.type === "AssignmentPattern") pattern(p.left);
    else if (p.type === "RestElement") pattern(p.argument);
  };
  const fn = /Function/.test(node.type);
  if (fn) node.params.forEach(pattern);
  if (node.type === "CatchClause") pattern(node.param);
  const body =
    node.type === "Program" || node.type === "BlockStatement"
      ? node.body
      : fn && node.body.type === "BlockStatement"
        ? node.body.body
        : node.type === "ForStatement"
          ? [node.init]
          : /^For(Of|In)Statement$/.test(node.type)
            ? [node.left]
            : node.type === "SwitchStatement"
              ? node.cases.flatMap((c) => c.consequent)
              : [];
  for (const statement of body) {
    if (statement?.type === "VariableDeclaration")
      statement.declarations.forEach((d) => pattern(d.id));
    if (/^(Function|Class)Declaration$/.test(statement?.type) && statement.id)
      names.add(statement.id.name);
  }
  return names;
}

// A local `t` (a clock, a texture) hides the import, and the call fails only when it runs.
async function shadowed(text) {
  const lines = [];
  const walk = (node, scopes) => {
    if (!node || typeof node.type !== "string") return;
    const own = bound(node);
    const inner =
      own.size || node.type === "Program" ? [...scopes, own] : scopes;
    if (
      node.type === "CallExpression" &&
      node.callee.name === "t" &&
      inner.slice(1).some((names) => names.has("t"))
    )
      lines.push(text.slice(0, node.start).split("\n").length);
    for (const [key, value] of Object.entries(node)) {
      if (["type", "start", "end", "loc", "range"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach((v) => walk(v, inner));
      else if (typeof value?.type === "string") walk(value, inner);
    }
  };
  walk(await parsers.acorn.parse(text, {}), []);
  return lines;
}

const keys = new Map();
const problems = [];
const note = (key, where) => {
  if (!keys.has(key)) keys.set(key, []);
  keys.get(key).push(where);
};
const LITERAL =
  /(?<![\w$.])t\(\s*(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1\s*(?=[,)])/g;
const DYNAMIC = /(?<![\w$.])t\(\s*(?!["'`])[^)\s]/g;
const candidates = [];
for (const file of await files(root)) {
  const text = await readFile(file, "utf8");
  const relative = path.relative(root, file);
  const line = (index) => text.slice(0, index).split("\n").length;
  for (const match of text.matchAll(LITERAL)) {
    const [, quote, body] = match;
    if (quote === "`" && body.includes("${"))
      problems.push(
        `${relative}:${line(match.index)} interpolates inside a key`,
      );
    else note(unescape(body, quote), `${relative}:${line(match.index)}`);
  }
  for (const match of text.matchAll(DYNAMIC))
    problems.push(`${relative}:${line(match.index)} passes a non-literal key`);
  if (/import \{[^}]*\bt\b[^}]*\} from "[./]*i18n\.js"/.test(text))
    for (const at of await shadowed(text))
      problems.push(`${relative}:${at} calls t() where a local t hides it`);
  if (process.argv.includes("--candidates")) {
    const prose =
      /(["'`])((?:\\[\s\S]|(?!\1)[^\\\n])*?[A-Za-z]{2,}[ ,.][A-Za-z]{2,}(?:\\[\s\S]|(?!\1)[^\\\n])*?)\1/g;
    for (const match of text.matchAll(prose)) {
      const before = text.slice(Math.max(0, match.index - 40), match.index);
      if (/(?<![\w$.])t\(\s*$/.test(before)) continue;
      const body = match[2];
      if (/^(?:[\w-]+\s)*[\w-]+$/.test(body) && !/[A-Z]/.test(body)) continue;
      if (
        /(gl_|vec[234]|uniform|varying|#include|=>|\bconst\b|\bfunction\b)/.test(
          body,
        )
      )
        continue;
      candidates.push(`${relative}:${line(match.index)} ${body.slice(0, 90)}`);
    }
  }
}

// The page: text outside scripts and styles, `data-i18n` elements whole, labelled attributes.
const page = await readFile(path.join(root, "index.html"), "utf8");
const VOID = new Set([
  "area",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const squash = (s) => s.replace(/\s+/g, " ").trim();
const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
const stack = [];
let whole = null;
const TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w-]*)([^>]*)>|[^<]+/g;
for (const match of page.matchAll(TOKEN)) {
  const [token, tag, attributes = ""] = match;
  if (token.startsWith("<!")) continue;
  if (!tag) {
    const text = squash(decode(token));
    if (
      text &&
      /\p{L}/u.test(text) &&
      !whole &&
      !stack.some((t) => t.name === "script" || t.name === "style" || t.keep)
    )
      note(text, "index.html");
    continue;
  }
  const name = tag.toLowerCase();
  if (token.startsWith("</")) {
    while (stack.length && stack.pop().name !== name);
    if (whole && stack.length < whole.depth) {
      note(squash(page.slice(whole.start, match.index)), "index.html");
      whole = null;
    }
    continue;
  }
  for (const [, attribute, value] of attributes.matchAll(
    /\b(aria-label|title|alt|placeholder)="([^"]*)"/g,
  ))
    if (/\p{L}/u.test(value))
      note(squash(decode(value)), `index.html ${attribute}`);
  if (VOID.has(name) || token.endsWith("/>")) continue;
  stack.push({ name, keep: /\btranslate="no"/.test(attributes) });
  if (!whole && /\bdata-i18n\b/.test(attributes))
    whole = { start: match.index + token.length, depth: stack.length };
}

const placeholders = (s) =>
  [...s.matchAll(/\{\w+\}/g)]
    .map((m) => m[0])
    .sort()
    .join(" ");
const tags = (s) =>
  [...s.matchAll(/<[^>]+>/g)]
    .map((m) => m[0])
    .sort()
    .join(" ");
const report = { keys: keys.size, languages: {} };
for (const id of LANGUAGES) {
  let table = {};
  try {
    table = (await import(pathToFileURL(path.join(root, "i18n", `${id}.js`))))
      .default;
  } catch {
    problems.push(`${id}: no table`);
  }
  const missing = [...keys.keys()].filter(
    (key) => typeof table[key] !== "string" || !table[key].trim(),
  );
  const stale = Object.keys(table).filter((key) => !keys.has(key));
  const mismatched = [...keys.keys()].filter(
    (key) =>
      typeof table[key] === "string" &&
      (placeholders(key) !== placeholders(table[key]) ||
        tags(key) !== tags(table[key])),
  );
  report.languages[id] = {
    missing: missing.length,
    stale: stale.length,
    mismatched: mismatched.length,
  };
  for (const key of missing.slice(0, 5))
    problems.push(`${id}: missing ${JSON.stringify(key).slice(0, 100)}`);
  for (const key of stale.slice(0, 5))
    problems.push(`${id}: stale ${JSON.stringify(key).slice(0, 100)}`);
  for (const key of mismatched.slice(0, 5))
    problems.push(
      `${id}: placeholders or tags differ in ${JSON.stringify(key).slice(0, 100)}`,
    );
  if (missing.length > 5 || stale.length > 5 || mismatched.length > 5)
    problems.push(
      `${id}: ${missing.length} missing, ${stale.length} stale, ${mismatched.length} mismatched in all`,
    );
}

const out = arg("write");
if (out)
  await writeFile(
    out,
    JSON.stringify(
      Object.fromEntries([...keys].sort(([a], [b]) => a.localeCompare(b))),
      null,
      2,
    ) + "\n",
  );
if (candidates.length) console.log(candidates.join("\n"));
console.log(JSON.stringify(report));
for (const problem of problems) console.log(`FAIL ${problem}`);
process.exitCode = problems.length ? 1 : 0;
