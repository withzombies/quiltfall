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

export function turnMessage(snapshot) {
  const { players, state } = snapshot.game;
  if (players.length < 2) return "Waiting for your partner…";
  if (state.phase.type === "finished") {
    return state.phase.winner === snapshot.you
      ? "You win! Nicely played."
      : `${players[state.phase.winner].name} wins!`;
  }
  if (state.phase.type === "graduation") {
    return state.turn === snapshot.you
      ? "Choose pieces to graduate"
      : `${players[state.turn].name} is choosing a graduation…`;
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
