import {
  acceptSnapshot,
  canPlace,
  cellLabel,
  poolCounts,
  turnMessage,
} from "./state.mjs";

const root = document.querySelector("#app");
const notice = document.querySelector("#notice");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let me = null;
let current = null;
let gameId = null;
let source = null;
let connected = false;
let busy = false;
let animating = false;
let motionController = null;
let routeEpoch = 0;
let selectedKind = "kitten";
let selectedOption = 0;
let updates = Promise.resolve();
let noticeTimer;
let historyTab = "active";
let showFinalQuilt = false;

function escape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function message(text) {
  notice.textContent = text;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.hidden = true;
  }, 5000);
}

async function api(path, payload) {
  const response = await fetch(path, {
    method: payload === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Could not read the server response." }));
  if (!response.ok) {
    const error = new Error(
      data.error || "That did not work. Please try again.",
    );
    error.status = response.status;
    error.current = data.current;
    throw error;
  }
  return data;
}

async function loadProfile() {
  try {
    me = await api("/api/me");
  } catch (error) {
    if (error.status === 401) me = null;
    else throw error;
  }
}

function cat(kind, owner, extra = "") {
  return `<img src="/${kind === "cat" ? "adult" : "cat"}.svg" class="cat owner-${owner} ${extra}" alt="" draggable="false">`;
}

function date(seconds) {
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function form(kind) {
  const joining = kind === "join";
  return `<form id="name-form">
    <label class="field-label" for="player-name">Your name</label>
    <input id="player-name" name="name" maxlength="32" required autocomplete="nickname" placeholder="e.g. Roo" value="${escape(me?.player.name ?? "")}" ${me ? "readonly" : ""}>
    <button class="button wide" type="submit">${joining ? "Join the quilt" : "Start a game"} <span aria-hidden="true">→</span></button>
    <p class="form-note">${me ? "Remembered on this browser. Ready when you are." : "Just an invite link. No sign-up."}</p>
  </form>`;
}

function bindNameForm(joining = false) {
  document
    .querySelector("#name-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.target.querySelector("button");
      button.disabled = true;
      const name = document.querySelector("#player-name").value.trim();
      try {
        const snapshot = await api(
          joining ? `/api/games/${gameId}/join` : "/api/games",
          { name },
        );
        await loadProfile();
        history.pushState({}, "", `/game/${snapshot.game.id}`);
        gameId = snapshot.game.id;
        current = null;
        busy = false;
        animating = false;
        selectedOption = 0;
        await enqueue(snapshot, false);
        connect();
      } catch (error) {
        message(
          error.message || "Could not reach the server. Please try again.",
        );
        button.disabled = false;
      }
    });
}

function renderHome() {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<section class="home-hero">
    <div class="hero-copy animate__animated animate__fadeInUp"><span class="eyebrow">CATS. QUILTS. FRIENDLY RIVALRY.</span>
      <h1>A little strategy.<br><em>A lot of cats.</em></h1>
      <p>Make room on the quilt. Grow your kittens into cats, line them up, and give your favorite person a gentle nudge.</p>
    </div>
    <img class="hero-art" src="/hero.svg" alt="Orange and sage cats relaxing on a patchwork quilt">
  </section>
  <section class="home-lower animate__animated animate__fadeIn">
    <div class="card"><h2>Pull up a quilt.</h2><p class="small">A cozy little game for you and your person.</p>${form("create")}</div>
    <div class="games-panel"><span class="eyebrow">YOUR LITTLE RIVALRY</span><h2 style="margin-top:10px">${me ? `Welcome back, ${escape(me.player.name)}.` : "Good games stay with you."}</h2>
      <div class="stats"><div class="stat"><strong>${me?.stats.played ?? 0}</strong><span>Games</span></div><div class="stat"><strong>${me?.stats.wins ?? 0}</strong><span>Wins</span></div><div class="stat"><strong>${me?.stats.losses ?? 0}</strong><span>Losses</span></div></div>
      <div class="tabs" role="tablist" aria-label="Your games"><button class="tab ${historyTab === "active" ? "selected" : ""}" data-tab="active" role="tab" aria-selected="${historyTab === "active"}">On the quilt${me?.active.length ? ` (${me.active.length})` : ""}</button><button class="tab ${historyTab === "history" ? "selected" : ""}" data-tab="history" role="tab" aria-selected="${historyTab === "history"}">Past games</button></div>
      <div id="game-list" role="tabpanel">${gameList()}</div>
    </div>
  </section>`;
  bindNameForm();
  document.querySelectorAll("[data-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      historyTab = button.dataset.tab;
      renderHome();
    }),
  );
}

function gameList() {
  const games = me?.[historyTab] ?? [];
  if (!games.length)
    return `<p class="empty">${historyTab === "active" ? "Nothing on the quilt just yet.<br>Start a game and invite someone you like." : "Your finished games will land here.<br>Every win, every loss, every lovely rivalry."}</p>`;
  return games
    .map(
      (game) =>
        `<a class="game-row" href="/game/${escape(game.id)}"><span>${game.opponent ? `You &amp; ${escape(game.opponent)}` : "A quilt for two"}<small>${date(game.ended_at ?? game.created_at)}</small></span><span class="row-tag ${game.ended_at && !game.won ? "loss" : ""}">${game.ended_at ? (game.won ? "You won" : "They won") : game.opponent ? "Resume →" : "Invite →"}</span></a>`,
    )
    .join("");
}

function renderJoin() {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<section class="join-page animate__animated animate__fadeInUp"><img class="hero-art" src="/hero.svg" alt="Cats on a quilt"><div class="card"><span class="eyebrow">THERE’S ROOM FOR TWO</span><h1 style="margin-top:14px">You’re invited.</h1><p class="small">Find a comfy spot. Your partner is waiting.</p>${form("join")}</div></section>`;
  bindNameForm(true);
}

function renderError(error) {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `<section class="join-page card"><h1>Lost the thread?</h1><p class="small">${escape(error.status === 404 ? error.message : "Could not connect to your game. Your saved moves are safe.")}</p><button class="button" id="retry">Try again</button> <a class="button secondary" href="/">Go home</a></section>`;
  document.querySelector("#retry").addEventListener("click", () => route());
}

function playerCard(owner) {
  const player = current.game.players[owner];
  const counts = poolCounts(current, owner);
  const active =
    current.game.players.length === 2 &&
    current.game.state.phase.type !== "finished" &&
    current.game.state.turn === owner;
  return `<div class="player-card owner-${owner} ${active ? "active" : ""}"><div class="player-name"><i class="player-dot"></i><span>${escape(player?.name ?? "Your partner")}</span>${current.you === owner ? '<span class="you-tag">YOU</span>' : ""}</div><div class="player-pool">${player ? `${counts.kitten} kittens · ${counts.cat} cats in pool` : "Saving them a spot"}</div></div>`;
}

function position(node, pos) {
  node.style.left = `${(pos.x * 100) / 6}%`;
  node.style.top = `${(pos.y * 100) / 6}%`;
}

function renderRematchControls() {
  const area = root.querySelector(".rematch-controls");
  if (!area) return;
  const key = `${current.game.revision}:${busy}:${connected}`;
  if (area.dataset.controlsKey === key) return;
  area.dataset.controlsKey = key;
  const { requested_by, game_id } = current.game.rematch;
  const partner = current.game.players[1 - current.you].name;
  const disabled = busy || !connected ? "disabled" : "";
  const button = (action, label, secondary = false) =>
    `<button class="button ${secondary ? "secondary" : ""}" data-rematch-action="${action}" ${disabled}>${escape(label)}</button>`;
  if (game_id) {
    area.innerHTML = `<a class="button wide" href="/game/${escape(game_id)}">Open next game <span aria-hidden="true">→</span></a>`;
  } else if (requested_by === current.you) {
    area.innerHTML = `<p class="rematch-status">Waiting for ${escape(partner)}…</p>${button("cancel", "Cancel offer", true)}`;
  } else if (requested_by !== null) {
    area.innerHTML = `<p class="rematch-status">${escape(partner)} wants another round</p><div class="rematch-actions">${button("accept", "Play again")}${button("decline", "Not now", true)}</div>`;
  } else {
    area.innerHTML = button("request", `Play again with ${partner}`);
  }
  area.querySelectorAll("[data-rematch-action]").forEach((node) => {
    node.addEventListener("click", () =>
      submit(node.dataset.rematchAction, "rematch"),
    );
  });
}

function renderResult() {
  const { state, players, id } = current.game;
  // A finished board stays immutable while rematch offers advance its revision.
  if (root.querySelector(".result-card")?.dataset.resultKey === id) {
    renderRematchControls();
    return;
  }
  const winner = state.phase.winner;
  const name = players[winner].name;
  const won = winner === current.you;
  const reason = {
    three_cats: "Three cats in a row",
    eight_cats: "Eight cats on the quilt",
    resignation: "Won by resignation",
  }[state.phase.reason];
  const confetti = Array.from(
    { length: 18 },
    (_, i) =>
      `<i style="--i:${i};--x:${8 + ((i * 29) % 84)}%;--delay:${(i % 4) * 0.06}s"></i>`,
  ).join("");
  root.innerHTML = `<section class="result-card result-screen animate__animated ${won ? "animate__bounceIn" : "animate__fadeIn"}" data-result-key="${escape(id)}">
    <span class="eyebrow">A QUILT WELL PLAYED</span>
    <h1 aria-live="polite">${won ? "You won the quilt!" : `${escape(name)} wins the quilt!`}</h1>
    <p class="result-copy">${won ? "A little victory. A lot of purrs." : "A lovely rivalry. There’s always another quilt."}</p>
    <div class="cat-party" data-winner="${winner}" aria-hidden="true">
      <div class="party-confetti">${confetti}</div>
      <div class="dancer kitten-dancer">${cat("kitten", winner)}</div>
      <div class="dancer champion"><svg class="crown" viewBox="0 0 64 44"><path d="M8 35 4 9l17 12L32 4l11 17L60 9l-4 26Z" fill="#e6bb61" stroke="#956b32" stroke-width="3" stroke-linejoin="round"/><path d="M10 40h44" stroke="#956b32" stroke-width="4" stroke-linecap="round"/></svg>${cat("cat", winner)}</div>
      <div class="dancer kitten-dancer">${cat("kitten", winner)}</div>
    </div>
    <div class="winner-chip">${escape(name)} <span>· quilt champion</span></div>
    <p class="result-details"><span class="result-reason">${reason}</span> · ${state.move_count} moves</p>
    <div class="rematch-controls" aria-live="polite"></div>
    <div class="result-links"><button class="text-button" id="view-quilt">View final quilt</button><a href="/">Your games</a></div>
  </section>`;
  renderRematchControls();
  document.querySelector("#view-quilt").addEventListener("click", () => {
    showFinalQuilt = true;
    renderGame();
  });
}

function renderGame() {
  if (!current) return;
  if (animating) {
    lockMoves();
    return;
  }
  const existing = new Map(
    [...root.querySelectorAll(".piece")].map((node) => [
      Number(node.dataset.piece),
      node,
    ]),
  );
  root.setAttribute("aria-busy", String(busy || animating));
  const { state, players } = current.game;
  const finished = state.phase.type === "finished";
  if (finished && !showFinalQuilt) {
    renderResult();
    return;
  }
  const waiting = players.length < 2;
  const counts = poolCounts(current, current.you);
  if (counts[selectedKind] === 0)
    selectedKind = counts.kitten ? "kitten" : "cat";
  const options = state.phase.type === "graduation" ? state.phase.options : [];
  const singles = new Set(
    options.filter((ids) => ids.length === 1).map((ids) => ids[0]),
  );
  const groups = options
    .map((ids, index) => ({ ids, index }))
    .filter((option) => option.ids.length > 1);
  if (!groups.some((option) => option.index === selectedOption)) {
    selectedOption = groups[0]?.index ?? -1;
  }
  const selected = options[selectedOption] ?? [];
  const eligible = !busy && !animating && connected;
  const yourGraduation =
    state.phase.type === "graduation" && state.turn === current.you;
  const mixed = [...singles].some((id) => state.pieces[id].kind === "cat");
  const graduationHint = !yourGraduation
    ? "Your partner is choosing which pieces to return."
    : singles.size
      ? groups.length
        ? "Tap one piece to return it, or choose a group below. Kittens become cats; cats return to your pool."
        : mixed
          ? "Your quilt is full. Tap one of your pieces. Kittens become cats; cats return to your pool."
          : "Your quilt is full. Tap a kitten to upgrade it."
      : "Select one group below. The highlighted pieces return to your pool.";
  let squares = "";
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const p = state.pieces.find((p) => p.pos?.x === x && p.pos?.y === y);
      const highlighted = p && selected.includes(p.id);
      const available = eligible && canPlace(current, selectedKind, x, y);
      const upgradeable = eligible && yourGraduation && p && singles.has(p.id);
      const action = upgradeable
        ? ` — ${p.kind === "cat" ? "Return cat" : "Upgrade kitten"}`
        : "";
      squares += `<button class="square ${available ? "available" : ""} ${upgradeable ? "upgradeable" : ""} ${highlighted ? "chosen" : ""}" data-x="${x}" data-y="${y}" ${upgradeable ? `data-upgrade="${p.id}"` : ""} aria-label="${escape(cellLabel(current, x, y) + action)}" ${available || upgradeable ? "" : "disabled"}></button>`;
    }
  }
  const subtitle = waiting
    ? "Share the invite below to get started."
    : finished
      ? `Finished in ${state.move_count} moves. Saved to your past games.`
      : state.phase.type === "graduation"
        ? graduationHint
        : `Tap an empty square to place a ${selectedKind}. Moves are final.`;
  root.innerHTML = `<section class="game-page">
    <div class="game-nav">${finished ? '<button class="text-button" id="celebration-back">← Back to celebration</button>' : '<a href="/">← Your games</a>'}<span class="connection ${connected ? "" : "offline"}" id="connection">${connected ? "Connected · game saved" : "Reconnecting…"}</span></div>
    <div class="players">${playerCard(0)}<span class="versus">&amp;</span>${playerCard(1)}</div>
    <div class="game-status" aria-live="polite"><h1>${finished ? "The final quilt" : escape(turnMessage(current))}</h1><p>${escape(subtitle)}</p></div>
    <div class="motion-viewport"><div class="bed-frame"><div class="quilt"><div class="board" role="group" aria-label="Six by six quilt board">${squares}</div><div class="pieces-layer" aria-hidden="true"></div></div></div></div>
    <div class="board-footnote"><span>A LITTLE NUDGE GOES A LONG WAY</span><span>MOVE ${state.move_count}</span></div>
    ${finished ? '<div class="rematch-controls" aria-live="polite"></div>' : ""}
    ${!waiting && !finished && state.phase.type === "placement" ? `<div class="piece-picker" aria-label="Choose a piece">${["kitten", "cat"].map((kind) => `<button class="pick ${kind === selectedKind ? "selected" : ""}" data-kind="${kind}" aria-pressed="${kind === selectedKind}" ${counts[kind] && eligible && state.turn === current.you ? "" : "disabled"}>${cat(kind, current.you)}<span><strong>${kind === "cat" ? "Cat" : "Kitten"}</strong><small>${counts[kind]} in your pool</small></span></button>`).join("")}</div>` : ""}
    ${waiting ? `<div class="invite-box"><p>Every quilt needs a second cat person.</p><div class="invite-link"><input id="invite-url" aria-label="Invite link" readonly value="${escape(location.origin + "/game/" + gameId)}"><button class="button" id="copy-invite">Copy link</button></div><p class="small" style="margin:8px 0 0">Send this link to your partner. Keep it just between you.</p></div>` : ""}
    ${
      groups.length && state.turn === current.you
        ? `<div class="graduation"><p>Pick one group to return to your pool.</p><div class="graduation-options">${groups
            .map(
              ({ ids, index }) =>
                `<button class="option ${index === selectedOption ? "selected" : ""}" data-option="${index}" ${eligible ? "" : "disabled"}>Graduate ${ids
                  .map((id) => {
                    const pos = state.pieces[id].pos;
                    return `${String.fromCharCode(65 + pos.x)}${pos.y + 1}`;
                  })
                  .join(" · ")}</button>`,
            )
            .join(
              "",
            )}</div><button class="button wide" id="graduate" ${eligible ? "" : "disabled"}>Confirm selection →</button></div>`
        : ""
    }
    ${!waiting && !finished ? '<div class="game-controls"><button class="text-button" id="resign">Resign this game</button><span class="text-button">Saved after every move</span></div>' : ""}
  </section>`;
  if (finished) renderRematchControls();
  document.querySelector("#celebration-back")?.addEventListener("click", () => {
    showFinalQuilt = false;
    renderGame();
  });
  const layer = document.querySelector(".pieces-layer");
  for (const piece of state.pieces.filter((p) => p.pos)) {
    const node = existing.get(piece.id) ?? pieceNode(piece);
    if (!node.classList.contains(piece.kind)) {
      node.className = `piece ${piece.kind}`;
      node.innerHTML = cat(piece.kind, piece.owner);
    }
    position(node, piece.pos);
    layer.append(node);
  }
  document.querySelectorAll(".square.available").forEach((square) =>
    square.addEventListener("click", () => {
      if (!busy && !animating && connected)
        submit({
          type: "place",
          kind: selectedKind,
          x: Number(square.dataset.x),
          y: Number(square.dataset.y),
        });
    }),
  );
  document.querySelectorAll("[data-kind]").forEach((button) =>
    button.addEventListener("click", () => {
      selectedKind = button.dataset.kind;
      renderGame();
    }),
  );
  document
    .querySelectorAll("[data-upgrade]")
    .forEach((square) =>
      square.addEventListener("click", () =>
        submit({ type: "graduate", pieces: [Number(square.dataset.upgrade)] }),
      ),
    );
  document.querySelectorAll("[data-option]").forEach((button) =>
    button.addEventListener("click", () => {
      selectedOption = Number(button.dataset.option);
      renderGame();
    }),
  );
  document
    .querySelector("#graduate")
    ?.addEventListener("click", () =>
      submit({ type: "graduate", pieces: options[selectedOption] }),
    );
  document.querySelector("#copy-invite")?.addEventListener("click", copyInvite);
  document
    .querySelector("#resign")
    ?.addEventListener("click", confirmResignation);
}

function pieceNode(piece) {
  const node = document.createElement("div");
  node.className = `piece ${piece.kind}`;
  node.dataset.piece = piece.id;
  node.innerHTML = cat(piece.kind, piece.owner);
  return node;
}

function lockMoves() {
  root.setAttribute("aria-busy", "true");
  root
    .querySelectorAll(".square, .pick, .option, #graduate, #resign")
    .forEach((node) => {
      node.disabled = true;
    });
}

function stopMotion() {
  motionController?.abort();
  motionController = null;
  animating = false;
}

async function animateEffects(next, signal) {
  const layer = root.querySelector(".pieces-layer");
  if (!layer) return;
  const size = layer.getBoundingClientRect().width / 6;
  const placed = next.effects.find((effect) => effect.motion === "place");
  const frame = (
    offset,
    x,
    y,
    sx = 1,
    sy = 1,
    rotation = 0,
    opacity = 1,
    easing = "ease-in-out",
  ) => ({
    offset,
    transform: `translate(${x * size}px, ${y * size}px) rotate(${rotation}deg) scale(${sx}, ${sy})`,
    opacity,
    easing,
  });
  for (const motion of ["place", "nudge", "graduate"]) {
    if (signal.aborted || !layer.isConnected) return;
    await Promise.all(
      next.effects
        .filter((effect) => effect.motion === motion)
        .map(async (effect) => {
          const piece = next.game.state.pieces[effect.piece];
          let node = layer.querySelector(`[data-piece="${effect.piece}"]`);
          if (!node) {
            node = pieceNode({ ...piece, kind: effect.kind });
            layer.append(node);
          }
          position(node, effect.from ?? effect.to);
          let keyframes;
          let duration;
          if (motion === "place") {
            duration = 650;
            keyframes = [
              frame(0, 0, -1.35, 0.85, 1.1, -12),
              frame(0.42, 0, 0.08, 1.2, 0.78, 0, 1, "ease-out"),
              frame(0.65, 0, -0.38, 0.92, 1.1, 7),
              frame(0.84, 0, 0.02, 1.07, 0.94),
              frame(1, 0, 0),
            ];
          } else if (motion === "nudge") {
            duration = 750;
            const dx = effect.to
              ? effect.to.x - effect.from.x
              : effect.from.x - placed.to.x;
            const dy = effect.to
              ? effect.to.y - effect.from.y
              : effect.from.y - placed.to.y;
            if (effect.to) {
              keyframes = [
                frame(0, 0, 0),
                frame(0.15, -dx * 0.08, -dy * 0.08, 1.12, 0.88),
                frame(0.4, dx * 0.5, dy * 0.5 - 0.38, 0.92, 1.08, dx * 12),
                frame(0.7, dx * 1.1, dy * 1.1, 1.15, 0.85, 0, 1, "ease-out"),
                frame(0.85, dx, dy - 0.12, 0.96, 1.04),
                frame(1, dx, dy),
              ];
            } else {
              const spin = (dx || dy) * 100;
              keyframes = [
                frame(0, 0, 0),
                frame(0.15, -dx * 0.08, -dy * 0.08, 1.12, 0.88),
                frame(0.45, dx * 0.75, dy * 0.75 - 0.28, 1, 1, spin * 0.35),
                frame(0.7, dx * 1.35, dy * 1.35 + 0.12, 0.92, 0.92, spin * 0.7),
                frame(
                  1,
                  dx * 1.7,
                  dy * 1.7 + 0.5,
                  0.65,
                  0.65,
                  spin,
                  0,
                  "ease-in",
                ),
              ];
            }
          } else {
            duration = 600;
            node.className = `piece ${effect.kind}`;
            node.innerHTML = cat(effect.kind, piece.owner);
            const pool = root.querySelector(
              `.player-card.owner-${piece.owner} .player-pool`,
            );
            const rect = pool.getBoundingClientRect();
            const origin = node.getBoundingClientRect();
            const dx =
              (rect.x + rect.width / 2 - origin.x - origin.width / 2) / size;
            const dy =
              (rect.y + rect.height / 2 - origin.y - origin.height / 2) / size;
            keyframes = [
              frame(0, 0, 0),
              frame(0.2, 0, 0.06, 1.15, 0.85),
              frame(0.45, 0, -0.45, 1.18, 1.18, piece.owner ? 12 : -12),
              frame(0.75, dx * 0.55, dy * 0.55 - 0.25, 0.7, 0.7, 0, 0.9),
              frame(1, dx, dy, 0.2, 0.2, 0, 0),
            ];
          }
          const animation = node.animate(keyframes, {
            duration,
            fill: "both",
            easing: "linear",
          });
          const cancel = () => animation.cancel();
          signal.addEventListener("abort", cancel, { once: true });
          try {
            await animation.finished;
            if (effect.to) position(node, effect.to);
            else node.remove();
          } finally {
            signal.removeEventListener("abort", cancel);
            animation.cancel();
          }
        }),
    );
  }
}

function enqueue(next, animate = true) {
  const epoch = routeEpoch;
  updates = updates.then(async () => {
    if (
      epoch !== routeEpoch ||
      gameId !== next.game.id ||
      !acceptSnapshot(current, next)
    )
      return;
    const previous = current;
    const sameTurn = previous?.game.state.turn === next.game.state.turn;
    current = next;
    if (
      previous &&
      !previous.game.rematch.game_id &&
      next.game.rematch.game_id
    ) {
      history.pushState({}, "", `/game/${next.game.rematch.game_id}`);
      // route() enqueues the next game's snapshot; awaiting it here would
      // deadlock this serial queue. Its epoch guards isolate the old stream.
      route();
      return;
    }
    if (!sameTurn) selectedOption = 0;
    const shouldAnimate =
      animate &&
      !reducedMotion.matches &&
      !document.hidden &&
      previous &&
      next.game.revision === previous.game.revision + 1 &&
      next.effects.length;
    if (shouldAnimate) {
      const controller = new AbortController();
      motionController = controller;
      animating = true;
      lockMoves();
      try {
        await animateEffects(next, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted)
          console.error("Piece animation failed", error);
      } finally {
        if (motionController === controller) {
          motionController = null;
          animating = false;
          if (epoch === routeEpoch && gameId === next.game.id) renderGame();
        }
      }
    } else renderGame();
  });
  return updates;
}

async function submit(action, endpoint = "actions") {
  if (busy || animating || !connected || !current) return;
  busy = true;
  const id = gameId;
  const epoch = routeEpoch;
  const revision = current.game.revision;
  if (endpoint === "rematch") renderGame();
  else lockMoves();
  try {
    const next = await api(`/api/games/${id}/${endpoint}`, {
      revision,
      action,
    });
    if (epoch !== routeEpoch || gameId !== id) return;
    await enqueue(next);
  } catch (error) {
    if (epoch !== routeEpoch || gameId !== id) return;
    if (error.current) await enqueue(error.current, false);
    else {
      // A response may be lost after a successful commit. Read saved state
      // before restoring controls, including the accepted next-game link.
      try {
        const saved = await api(`/api/games/${id}`);
        if (epoch !== routeEpoch || gameId !== id) return;
        await enqueue(saved, false);
      } catch {
        if (epoch !== routeEpoch || gameId !== id) return;
        connected = false;
      }
    }
    if (epoch === routeEpoch && gameId === id)
      message(
        error.message || "Connection interrupted. Checking your saved game…",
      );
  } finally {
    if (epoch === routeEpoch && gameId === id) {
      busy = false;
      renderGame();
    }
  }
}

function connect() {
  source?.close();
  if (!gameId || document.hidden) return;
  const id = gameId;
  const epoch = routeEpoch;
  source = new EventSource(`/api/games/${id}/events`);
  let initial = true;
  source.addEventListener("snapshot", (event) => {
    if (gameId !== id || epoch !== routeEpoch) return;
    connected = true;
    const snapshot = JSON.parse(event.data);
    const first = initial;
    initial = false;
    enqueue(snapshot, !first).then(() => {
      if (!busy && !animating && gameId === id && epoch === routeEpoch)
        renderGame();
    });
  });
  source.onerror = () => {
    if (gameId !== id || epoch !== routeEpoch) return;
    connected = false;
    initial = true;
    if (!animating) renderGame();
  };
}

async function copyInvite() {
  const input = document.querySelector("#invite-url");
  try {
    if (!navigator.clipboard) throw new Error("Manual copy needed");
    await navigator.clipboard.writeText(input.value);
    message("Invite copied. Send it to your person.");
  } catch {
    if (!input.isConnected) return;
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, input.value.length);
    let copied = false;
    try {
      // Local HTTP lacks the secure Clipboard API. This command still works
      // during the tap in browsers that support the legacy copy operation.
      copied = document.execCommand("copy");
    } catch {
      // Leave the entire link selected when the browser refuses both paths.
    }
    message(
      copied
        ? "Invite copied. Send it to your person."
        : "Your browser blocked copying. Link selected — touch and hold to copy.",
    );
  }
}

function confirmResignation() {
  if (busy || animating || !connected) return;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "resign-title");
  dialog.innerHTML =
    '<h2 id="resign-title">Leave this quilt?</h2><p class="small">Your partner will win this game. You can always start another.</p><div class="dialog-actions"><button class="button secondary" id="keep-playing">Keep playing</button><button class="button" id="confirm-resign">Resign</button></div>';
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog
    .querySelector("#keep-playing")
    .addEventListener("click", () => dialog.close());
  dialog.querySelector("#confirm-resign").addEventListener("click", () => {
    dialog.close();
    submit({ type: "resign" });
  });
  dialog.showModal();
}

async function route() {
  const epoch = ++routeEpoch;
  stopMotion();
  source?.close();
  connected = false;
  current = null;
  busy = false;
  animating = false;
  showFinalQuilt = false;
  selectedOption = 0;
  selectedKind = "kitten";
  const match = location.pathname.match(/^\/game\/([a-zA-Z0-9-]+)$/);
  gameId = match?.[1] ?? null;
  const id = gameId;
  root.setAttribute("aria-busy", "true");
  root.innerHTML = '<p class="loading">Fluffing the pillows…</p>';
  try {
    await loadProfile();
    if (epoch !== routeEpoch || gameId !== id) return;
    if (!id) {
      renderHome();
      return;
    }
    try {
      const snapshot = await api(`/api/games/${id}`);
      if (epoch !== routeEpoch || gameId !== id) return;
      await enqueue(snapshot, false);
      if (epoch !== routeEpoch || gameId !== id) return;
      connect();
    } catch (error) {
      if (epoch !== routeEpoch || gameId !== id) return;
      if (error.status === 401 || error.status === 403) renderJoin();
      else renderError(error);
    }
  } catch (error) {
    if (epoch === routeEpoch && gameId === id) renderError(error);
  }
}

const rulesDialog = document.querySelector("#rules-dialog");
document
  .querySelector("#rules-open")
  .addEventListener("click", () => rulesDialog.showModal());
document
  .querySelector("#rules-close")
  .addEventListener("click", () => rulesDialog.close());
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (
    !link ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  )
    return;
  const url = new URL(link.href);
  if (
    url.origin === location.origin &&
    (url.pathname === "/" || url.pathname.startsWith("/game/"))
  ) {
    event.preventDefault();
    history.pushState({}, "", url.pathname);
    route();
  }
});
window.addEventListener("popstate", route);
document.addEventListener("visibilitychange", () => {
  if (!gameId) return;
  if (document.hidden) {
    source?.close();
    connected = false;
    stopMotion();
    if (current) renderGame();
  } else {
    connected = false;
    if (!animating) renderGame();
    connect();
  }
});
window.addEventListener("online", () => {
  if (gameId) connect();
  else route();
});
window.addEventListener("offline", () => {
  connected = false;
  if (current && !animating) renderGame();
});
route();

reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches && animating) {
    stopMotion();
    renderGame();
  }
});
window.addEventListener("resize", () => {
  if (animating) {
    stopMotion();
    renderGame();
  }
});
