import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export async function verifyRelease(base) {
  const health = await fetch(`${base}/health`);
  assert.ok(health.ok, "deployed primary must be healthy");
  for (const asset of ["app.js", "style.css", "state.mjs"]) {
    const response = await fetch(`${base}/${asset}`);
    assert.ok(response.ok, `deployed ${asset} must be served`);
    assert.equal(
      await response.text(),
      readFileSync(new URL(`../web/${asset}`, import.meta.url), "utf8"),
      `deployed ${asset} must match the tested source`,
    );
  }
}
