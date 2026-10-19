export function poolCounts(snapshot, owner) {
  const counts = { kitten: 0, cat: 0 };
  for (const piece of snapshot.game.state.pieces) {
    if (piece.owner === owner && !piece.pos) counts[piece.kind]++;
  }
  return counts;
}

export function canPlace(snapshot, kind, x, y) {
  if (!snapshot || snapshot.game.players.length !== 2) return false;
  const { state } = snapshot.game;
  return (
    state.phase.type === "placement" &&
    state.turn === snapshot.you &&
    x >= 0 &&
    x < 6 &&
    y >= 0 &&
    y < 6 &&
    poolCounts(snapshot, snapshot.you)[kind] > 0 &&
    !state.pieces.some((p) => p.pos?.x === x && p.pos?.y === y)
  );
}

export function acceptSnapshot(current, next) {
  return (
    !current ||
    current.game.id !== next.game.id ||
    next.game.revision > current.game.revision
  );
}

export function decisionPlayer(snapshot) {
  const { pieces, phase, turn } = snapshot.game.state;
  return phase.type === "graduation"
    ? pieces.find((piece) => piece.id === phase.options[0][0]).owner
    : turn;
}

export function replayFrames(recording) {
  if (!recording) return [];
  let state = structuredClone(recording.before);
  const frames = [{ state: structuredClone(state), label: "Before the move" }];
  for (const step of recording.steps) {
    for (const [motion, label] of [
      ["place", "Placement"],
      ["nudge", "Nudges"],
      ["graduate", "Graduation"],
    ]) {
      const effects = step.effects.filter((effect) => effect.motion === motion);
      if (!effects.length) continue;
      for (const effect of effects) {
        const piece = state.pieces.find((piece) => piece.id === effect.piece);
        piece.pos = structuredClone(effect.to);
        piece.kind = effect.kind;
      }
      state.move_count = step.state.move_count;
      frames.push({ state: structuredClone(state), label });
    }
    state = structuredClone(step.state);
    frames.at(-1).state = structuredClone(state);
  }
  return frames;
}

export function turnMessage(snapshot) {
  const { players, state } = snapshot.game;
  if (players.length < 2) return "Waiting for your partner…";
  if (state.phase.type === "finished") {
    return state.phase.winner === snapshot.you
      ? "You win! Nicely played."
      : `${players[state.phase.winner].name} wins!`;
  }
  if (state.phase.type === "graduation") {
    const owner = decisionPlayer(snapshot);
    return owner === snapshot.you
      ? "Choose pieces to graduate"
      : `${players[owner].name} is choosing a graduation…`;
  }
  return state.turn === snapshot.you
    ? "Your turn. Make yourself comfy."
    : `${players[state.turn].name}’s turn`;
}

export function cellLabel(snapshot, x, y) {
  const piece = snapshot.game.state.pieces.find(
    (p) => p.pos?.x === x && p.pos?.y === y,
  );
  const name = piece
    ? `${snapshot.game.players[piece.owner]?.name ?? "Player"}’s ${piece.kind}`
    : "Empty";
  return `${String.fromCharCode(65 + x)}${y + 1}: ${name}`;
}
