import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  assertGameContinuity,
  verifyRelease,
} from "../scripts/verify-release.mjs";

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

test("redeploy continuity accepts an empty recording added to an existing game", () => {
  const before = {
    id: "saved-game",
    players: [
      { id: "host", name: "Roo" },
      { id: "guest", name: "Bean" },
    ],
    state: JSON.parse(
      readFileSync(
        new URL("./fixtures/game-states-v1.json", import.meta.url),
        "utf8",
      ),
    ).placement,
    revision: 2,
    created_at: 123,
    ended_at: null,
    rematch: { requested_by: null, game_id: null },
  };
  const after = { ...structuredClone(before), last_move: null };
  assertGameContinuity(before, after);
  for (const change of [
    (game) => {
      game.state.pieces[0].pos = { x: 2, y: 2 };
    },
    (game) => {
      game.revision++;
    },
    (game) => {
      game.players[0].id = "different-player";
    },
    (game) => {
      game.rematch.requested_by = 0;
    },
    (game) => {
      game.last_move = { before: game.state, steps: [] };
    },
  ]) {
    const changed = structuredClone(after);
    change(changed);
    assert.throws(
      () => assertGameContinuity(before, changed),
      assert.AssertionError,
    );
  }
});

test("redeploy continuity preserves an existing recording exactly", () => {
  const before = {
    id: "saved-game",
    revision: 2,
    last_move: {
      before: { move_count: 0 },
      steps: [{ state: { move_count: 1 }, effects: [] }],
    },
  };
  assertGameContinuity(before, structuredClone(before));
  assert.throws(
    () => assertGameContinuity(before, { ...before, last_move: null }),
    assert.AssertionError,
  );
});
