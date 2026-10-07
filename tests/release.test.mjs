import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { verifyRelease } from "../scripts/verify-release.mjs";

const assets = new Map(
  ["app.js", "style.css", "state.mjs"].map((asset) => [
    `/${asset}`,
    readFileSync(new URL(`../web/${asset}`, import.meta.url), "utf8"),
  ]),
);

async function serve(t, change = () => {}) {
  const server = createServer((request, response) => {
    const result = {
      status: 200,
      body: request.url === "/health" ? "ok" : assets.get(request.url),
    };
    change(request.url, result);
    response.writeHead(result.status);
    response.end(result.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("release verification accepts healthy source-matching assets", async (t) => {
  await verifyRelease(await serve(t));
});

test("release verification rejects an unhealthy primary", async (t) => {
  const base = await serve(t, (path, result) => {
    if (path === "/health") result.status = 503;
  });
  await assert.rejects(verifyRelease(base), /primary must be healthy/);
});

test("release verification rejects stale frontend assets", async (t) => {
  const base = await serve(t, (path, result) => {
    if (path === "/app.js") result.body = "previous release";
  });
  await assert.rejects(
    verifyRelease(base),
    /app.js must match the tested source/,
  );
});

test("release verification rejects missing assets", async (t) => {
  const base = await serve(t, (path, result) => {
    if (path === "/state.mjs") result.status = 404;
  });
  await assert.rejects(verifyRelease(base), /state.mjs must be served/);
});
