use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Kitten,
    Cat,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pos {
    pub x: i8,
    pub y: i8,
}

impl Pos {
    fn on_bed(self) -> bool {
        (0..6).contains(&self.x) && (0..6).contains(&self.y)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Piece {
    pub id: u8,
    pub owner: u8,
    pub kind: Kind,
    pub pos: Option<Pos>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Phase {
    Placement,
    Graduation { options: Vec<Vec<u8>> },
    Finished { winner: u8, reason: String },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameState {
    pub pieces: Vec<Piece>,
    pub turn: u8,
    pub phase: Phase,
    pub move_count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Place { kind: Kind, x: i8, y: i8 },
    Graduate { pieces: Vec<u8> },
    Resign,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Motion {
    Place,
    Nudge,
    Graduate,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Effect {
    pub piece: u8,
    pub from: Option<Pos>,
    pub to: Option<Pos>,
    pub kind: Kind,
    pub motion: Motion,
}

pub struct Transition {
    pub state: GameState,
    pub effects: Vec<Effect>,
}

impl GameState {
    pub fn new(first: u8) -> Self {
        Self {
            pieces: (0..16)
                .map(|id| Piece {
                    id,
                    owner: id / 8,
                    kind: Kind::Kitten,
                    pos: None,
                })
                .collect(),
            turn: first,
            phase: Phase::Placement,
            move_count: 0,
        }
    }

    pub fn apply(&self, actor: u8, action: Action) -> Result<Transition, &'static str> {
        if actor > 1 {
            return Err("Unknown player.");
        }
        if matches!(self.phase, Phase::Finished { .. }) {
            return Err("This game is finished.");
        }
        let mut state = self.clone();
        let mut effects = Vec::new();
        if matches!(action, Action::Resign) {
            state.phase = Phase::Finished {
                winner: 1 - actor,
                reason: "resignation".into(),
            };
            return Ok(Transition { state, effects });
        }
        // Pending options always contain one owner's pieces. The placing
        // player's turn continues while their opponent chooses a graduation.
        let decision_player = match &self.phase {
            Phase::Graduation { options } => self.pieces[options[0][0] as usize].owner,
            _ => self.turn,
        };
        if actor != decision_player {
            return Err("It is your partner's turn.");
        }
        match action {
            Action::Place { kind, x, y } => {
                if !matches!(self.phase, Phase::Placement) {
                    return Err("Choose a graduation first.");
                }
                let pos = Pos { x, y };
                if !pos.on_bed() {
                    return Err("Choose a square on the bed.");
                }
                if self.at(pos).is_some() {
                    return Err("That square is occupied.");
                }
                let index = self
                    .pieces
                    .iter()
                    .position(|p| p.owner == actor && p.kind == kind && p.pos.is_none())
                    .ok_or("You have no pieces of that kind in your pool.")?;
                state.move_piece(index, Some(pos), kind, Motion::Place, &mut effects);
                // Use the board after placement but before any nudges: all pushes
                // happen simultaneously and never propagate to other pieces.
                let placed = state.clone();
                for dy in -1..=1 {
                    for dx in -1..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        if let Some(i) = placed.at(Pos {
                            x: x + dx,
                            y: y + dy,
                        }) {
                            let neighbor = &placed.pieces[i];
                            if kind == Kind::Kitten && neighbor.kind == Kind::Cat {
                                continue;
                            }
                            let target = Pos {
                                x: x + 2 * dx,
                                y: y + 2 * dy,
                            };
                            if placed.at(target).is_none() {
                                state.move_piece(
                                    i,
                                    target.on_bed().then_some(target),
                                    neighbor.kind,
                                    Motion::Nudge,
                                    &mut effects,
                                );
                            }
                        }
                    }
                }
                state.move_count += 1;
                state.finish_placement(&mut effects);
            }
            Action::Graduate { mut pieces } => {
                let Phase::Graduation { options } = &self.phase else {
                    return Err("There is no graduation to choose.");
                };
                pieces.sort_unstable();
                let valid = options.iter().any(|option| {
                    let mut sorted = option.clone();
                    sorted.sort_unstable();
                    sorted == pieces
                });
                if !valid {
                    return Err("Choose one of the highlighted graduation options.");
                }
                state.graduate(&pieces, &mut effects);
                if actor == self.turn {
                    state.finish_opponent_graduation(&mut effects);
                } else {
                    state.end_turn();
                }
            }
            Action::Resign => unreachable!(),
        }
        Ok(Transition { state, effects })
    }

    fn at(&self, pos: Pos) -> Option<usize> {
        self.pieces.iter().position(|p| p.pos == Some(pos))
    }

    fn move_piece(
        &mut self,
        index: usize,
        to: Option<Pos>,
        kind: Kind,
        motion: Motion,
        effects: &mut Vec<Effect>,
    ) {
        let piece = &mut self.pieces[index];
        effects.push(Effect {
            piece: piece.id,
            from: piece.pos,
            to,
            kind,
            motion,
        });
        piece.pos = to;
        piece.kind = kind;
    }

    fn lines(&self, owner: u8) -> Vec<Vec<u8>> {
        let mut lines = Vec::new();
        for piece in &self.pieces {
            if piece.owner != owner {
                continue;
            }
            let Some(pos) = piece.pos else {
                continue;
            };
            for (dx, dy) in [(1, 0), (0, 1), (1, 1), (-1, 1)] {
                let mut line = vec![piece.id];
                for step in 1..=2 {
                    if let Some(i) = self.at(Pos {
                        x: pos.x + step * dx,
                        y: pos.y + step * dy,
                    }) && self.pieces[i].owner == owner
                    {
                        line.push(self.pieces[i].id);
                    }
                }
                if line.len() == 3 {
                    lines.push(line);
                }
            }
        }
        lines
    }

    fn finish_placement(&mut self, effects: &mut Vec<Effect>) {
        let mut options = self.lines(self.turn);
        let on_bed: Vec<u8> = self
            .pieces
            .iter()
            .filter(|p| p.owner == self.turn && p.pos.is_some())
            .map(|p| p.id)
            .collect();
        if options.iter().any(|line| {
            line.iter()
                .all(|id| self.pieces[*id as usize].kind == Kind::Cat)
        }) {
            self.phase = Phase::Finished {
                winner: self.turn,
                reason: "three_cats".into(),
            };
            return;
        }
        if on_bed.len() == 8 {
            if on_bed
                .iter()
                .all(|id| self.pieces[*id as usize].kind == Kind::Cat)
            {
                self.phase = Phase::Finished {
                    winner: self.turn,
                    reason: "eight_cats".into(),
                };
                return;
            }
            options.extend(on_bed.into_iter().map(|id| vec![id]));
        }
        if !self.resolve_graduation(options, effects) {
            self.finish_opponent_graduation(effects);
        }
    }

    fn finish_opponent_graduation(&mut self, effects: &mut Vec<Effect>) {
        let options = self
            .lines(1 - self.turn)
            .into_iter()
            .filter(|line| {
                line.iter()
                    .any(|id| self.pieces[*id as usize].kind == Kind::Kitten)
            })
            .collect();
        if !self.resolve_graduation(options, effects) {
            self.end_turn();
        }
    }

    // Returns whether this owner must choose before resolution can continue.
    fn resolve_graduation(&mut self, options: Vec<Vec<u8>>, effects: &mut Vec<Effect>) -> bool {
        match options.len() {
            0 => false,
            1 => {
                self.graduate(&options[0], effects);
                false
            }
            _ => {
                self.phase = Phase::Graduation { options };
                true
            }
        }
    }

    fn graduate(&mut self, ids: &[u8], effects: &mut Vec<Effect>) {
        for id in ids {
            self.move_piece(*id as usize, None, Kind::Cat, Motion::Graduate, effects);
        }
    }

    fn end_turn(&mut self) {
        self.turn = 1 - self.turn;
        self.phase = Phase::Placement;
    }
}
