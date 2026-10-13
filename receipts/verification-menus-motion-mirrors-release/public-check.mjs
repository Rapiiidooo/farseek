import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const release = JSON.parse(
  await readFile(new URL("release.json", import.meta.url), "utf8"),
);
const result = { passed: false, commit: release.commit, files: [], routes: [] };
const website = "e7a2dc08-58e3-4c04-8940-bd67b7b6db42";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function file(hostname, name, expected) {
  const response = await fetch(
    `https://${hostname}/${name.replace(/^game\//, "")}`,
    {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(20000),
    },
  );
  assert.equal(response.status, 200, hostname + ": " + name);
  const hash = digest(Buffer.from(await response.arrayBuffer()));
  assert.equal(hash, expected, hostname + ": " + name);
  result.files.push({ hostname, name, sha256: hash });
}
async function route(hostname, name, path, init, expected) {
  const response = await fetch(`https://${hostname}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.text();
  result.routes.push({ hostname, name, status: response.status });
  assert.equal(response.status, expected, hostname + ": " + name + ": " + body);
  console.log("PASS " + hostname + ": " + name);
}
try {
  const queue = Object.entries(release.files);
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      let entry;
      while ((entry = queue.shift()))
        await file("farseek.rapidoai.dev", ...entry);
    }),
  );
  console.log(
    "PASS: All " + result.files.length + " public Farseek files match",
  );
  for (const name of ["game/index.html", "game/main.js", "game/analytics.js"])
    await file("fardoor.rapidoai.dev", name, release.files[name]);
  for (const hostname of ["farseek.rapidoai.dev", "fardoor.rapidoai.dev"]) {
    const headers = {
      Origin: `https://${hostname}`,
      "X-Umami-Website-Id": website,
      "X-Umami-Hostname": hostname,
      "Content-Type": "application/json",
    };
    const post = { method: "POST", headers, body: "{}" };
    await route(hostname, "Tracker script", "/analytics/script.js", {}, 200);
    await route(
      hostname,
      "Matched collection reaches payload validation",
      "/analytics/api/send",
      post,
      400,
    );
    await route(
      hostname,
      "Dashboard API is not exposed",
      "/analytics/api/websites",
      {},
      404,
    );
    for (const [name, patch] of [
      ["Unrelated origin", { Origin: "https://example.org" }],
      ["Unrelated hostname", { "X-Umami-Hostname": "example.org" }],
      [
        "Unrelated website",
        { "X-Umami-Website-Id": "00000000-0000-0000-0000-000000000000" },
      ],
      [
        "Crossed origin and hostname",
        {
          "X-Umami-Hostname":
            hostname === "farseek.rapidoai.dev"
              ? "fardoor.rapidoai.dev"
              : "farseek.rapidoai.dev",
        },
      ],
    ])
      await route(
        hostname,
        name + " is rejected",
        "/analytics/api/send",
        { ...post, headers: { ...headers, ...patch } },
        404,
      );
    await route(
      hostname,
      "Collection body limit",
      "/analytics/api/send",
      { ...post, body: JSON.stringify({ padding: "x".repeat(17000) }) },
      413,
    );
  }
  result.passed = true;
} catch (error) {
  result.failure = error.stack;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await writeFile(
    new URL("public.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
}
