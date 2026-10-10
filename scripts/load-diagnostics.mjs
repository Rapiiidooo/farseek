import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const fields = [
  "at",
  "stage",
  "message",
  "stack",
  "mode",
  "chapter",
  "world",
  "online",
  "contextLost",
  "trace",
  "context",
];

export async function recordLoadFailure(
  req,
  res,
  port,
  folder = path.resolve("receipts/verification-loading-failure/live"),
) {
  if (
    req.method !== "POST" ||
    ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(
      req.headers.origin,
    ) ||
    req.headers["content-type"] !== "application/json"
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) {
      res.writeHead(413);
      res.end();
      return;
    }
    chunks.push(chunk);
  }
  let failure;
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    failure = Object.fromEntries(fields.map((field) => [field, value[field]]));
    if (typeof failure.stack !== "string" || typeof failure.stage !== "string")
      throw new Error("Missing load error details");
    if (
      failure.trace &&
      (!Array.isArray(failure.trace) || failure.trace.length > 48)
    )
      throw new Error("Invalid load trace");
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  await mkdir(folder, { recursive: true });
  await appendFile(
    path.join(folder, "errors.jsonl"),
    JSON.stringify(failure) + "\n",
  );
  console.error(`[load-error] ${failure.stage}\n${failure.stack}`);
  res.writeHead(204, { "Cache-Control": "no-store" });
  res.end();
}
