import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canPlace,
  poolCounts,
  acceptSnapshot,
  turnMessage,
  cellLabel,
} from "../web/state.mjs";

const snapshot = (revision = 1) => ({
  you: 0,
  game: {
    id: "game",
    revision,
    players: [{ name: "Ryan" }, { name: "GF" }],
    state: {
      turn: 0,
      phase: { type: "placement" },
      pieces: [
        { id: 0, owner: 0, kind: "kitten", pos: null },
        { id: 1, owner: 0, kind: "cat", pos: null },
        { id: 8, owner: 1, kind: "kitten", pos: { x: 2, y: 2 } },
      ],
    },
  },
  effects: [],
});

test("only the active player can place an available piece on an empty square", () => {
  const s = snapshot();
  assert.equal(canPlace(s, "kitten", 0, 0), true);
  assert.equal(canPlace(s, "cat", 0, 0), true);
  assert.equal(canPlace(s, "kitten", 2, 2), false);
  s.game.state.turn = 1;
  assert.equal(canPlace(s, "kitten", 0, 0), false);
  s.game.state.turn = 0;
  s.game.state.phase.type = "graduation";
  assert.equal(canPlace(s, "kitten", 0, 0), false);
});

test("waiting games and finished games block placement", () => {
  const s = snapshot();
  s.game.players.pop();
  assert.equal(canPlace(s, "kitten", 0, 0), false);
  s.game.players.push({ name: "GF" });
  s.game.state.phase = { type: "finished", winner: 0 };
  assert.equal(canPlace(s, "kitten", 0, 0), false);
  assert.equal(canPlace(null, "kitten", 0, 0), false);
});

test("pool counts exclude pieces on the bed and distinguish kittens and cats", () => {
  assert.deepEqual(poolCounts(snapshot(), 0), { kitten: 1, cat: 1 });
  assert.deepEqual(poolCounts(snapshot(), 1), { kitten: 0, cat: 0 });
});

test("duplicate and out of order snapshots cannot rewind the board", () => {
  const current = snapshot(5);
  assert.equal(acceptSnapshot(current, snapshot(4)), false);
  assert.equal(acceptSnapshot(current, snapshot(5)), false);
  assert.equal(acceptSnapshot(current, snapshot(6)), true);
  assert.equal(acceptSnapshot(null, current), true);
  const other = snapshot(1);
  other.game.id = "new";
  assert.equal(acceptSnapshot(current, other), true);
});

test("status explains turn, graduation, waiting and winner", () => {
  const s = snapshot();
  assert.match(turnMessage(s), /Your turn/);
  s.game.state.turn = 1;
  assert.match(turnMessage(s), /GF/);
  s.game.state.phase.type = "graduation";
  s.game.state.turn = 0;
  assert.match(turnMessage(s), /Choose/);
  s.game.state.phase = { type: "finished", winner: 1 };
  assert.match(turnMessage(s), /GF wins/);
  s.game.players.pop();
  assert.match(turnMessage(s), /Waiting/);
});

test("board cells have useful coordinate and piece labels", () => {
  assert.match(cellLabel(snapshot(), 2, 2), /C3.*GF.*kitten/);
  assert.match(cellLabel(snapshot(), 0, 0), /A1.*Empty/);
});
