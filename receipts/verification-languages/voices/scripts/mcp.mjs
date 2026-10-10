// Minimal Atlas MCP client over streamable HTTP. The Authorization header comes from the
// authorized loader and stays in memory: it is never printed, logged or written.
//   node mcp.mjs list <out.json>
//   node mcp.mjs call <tool> <args.json> <out.json> [timeoutSeconds]
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const ENDPOINT = "https://mcp.prod-market.atlas.design/mcp";
const LOADER =
  "/Users/rapido/perso/bittensor/404/farseek/scripts/atlas-headers.zsh";

export async function authorization() {
  const { stdout } = await promisify(execFile)("/bin/zsh", [LOADER], {
    maxBuffer: 8192,
  });
  const headers = JSON.parse(stdout);
  assert(headers.Authorization?.startsWith("Bearer "));
  return headers.Authorization;
}

function parseBody(type, text, id) {
  if (!type.includes("text/event-stream")) return JSON.parse(text);
  let found = null;
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    const message = JSON.parse(data);
    if (message.id === id) found = message;
  }
  return found;
}

export async function session() {
  const auth = await authorization();
  let sessionId = null;
  let next = 1;
  async function post(body, timeout = 120) {
    const headers = {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(timeout * 1000),
    });
    sessionId = response.headers.get("mcp-session-id") || sessionId;
    const text = await response.text();
    if (!response.ok)
      throw new Error(
        `Atlas MCP HTTP ${response.status}: ${text.slice(0, 400)}`,
      );
    if (body.id === undefined) return null;
    return parseBody(response.headers.get("content-type") || "", text, body.id);
  }
  async function request(method, params, timeout) {
    const id = next++;
    const reply = await post({ jsonrpc: "2.0", id, method, params }, timeout);
    if (reply?.error)
      throw new Error(`Atlas MCP ${method}: ${JSON.stringify(reply.error)}`);
    return reply?.result;
  }
  const init = await request("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "farseek-mira-voice", version: "1.0.0" },
  });
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  return {
    init,
    list: async () => {
      const tools = [];
      let cursor;
      do {
        const page = await request("tools/list", cursor ? { cursor } : {});
        tools.push(...(page?.tools || []));
        cursor = page?.nextCursor;
      } while (cursor);
      return tools;
    },
    call: (name, args, timeout = 240) =>
      request("tools/call", { name, arguments: args }, timeout),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...rest] = process.argv.slice(2);
  const s = await session();
  if (command === "list") {
    const tools = await s.list();
    await writeFile(
      rest[0],
      JSON.stringify({ server: s.init?.serverInfo, tools }, null, 2) + "\n",
    );
    console.log(
      `${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`,
    );
  } else if (command === "call") {
    const [tool, argsPath, out, timeout] = rest;
    const args = JSON.parse(await readFile(argsPath, "utf8"));
    const started = Date.now();
    let result;
    try {
      result = await s.call(tool, args, Number(timeout) || 240);
    } catch (error) {
      result = { clientError: String(error.message || error) };
    }
    await writeFile(
      out,
      JSON.stringify(
        {
          tool,
          arguments: args,
          seconds: (Date.now() - started) / 1000,
          result,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `${tool} -> ${out} (${((Date.now() - started) / 1000).toFixed(1)} s)`,
    );
  } else throw new Error("usage: list <out> | call <tool> <args.json> <out>");
}
