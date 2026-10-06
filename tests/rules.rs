use quiltfall::game::{Action, GameState, Kind, Phase, Pos};

fn put(g: &mut GameState, owner: u8, kind: Kind, x: i8, y: i8) -> u8 {
    let p = g
        .pieces
        .iter_mut()
        .find(|p| p.owner == owner && p.pos.is_none())
        .unwrap();
    p.kind = kind;
    p.pos = Some(Pos { x, y });
    p.id
}
fn place(g: &GameState, kind: Kind, x: i8, y: i8) -> GameState {
    g.apply(g.turn, Action::Place { kind, x, y }).unwrap().state
}

#[test]
fn starts_with_eight_kittens_each_and_no_pieces_on_the_bed() {
    let g = GameState::new(1);
    assert_eq!(g.turn, 1);
    assert_eq!(g.pieces.len(), 16);
    for owner in 0..2 {
        assert_eq!(g.pieces.iter().filter(|p| p.owner == owner).count(), 8);
    }
    assert!(
        g.pieces
            .iter()
            .all(|p| p.kind == Kind::Kitten && p.pos.is_none())
    );
}

#[test]
fn placement_nudges_in_all_eight_directions() {
    for (dx, dy) in [
        (-1, -1),
        (-1, 0),
        (-1, 1),
        (0, -1),
        (0, 1),
        (1, -1),
        (1, 0),
        (1, 1),
    ] {
        let mut g = GameState::new(0);
        let id = put(&mut g, 1, Kind::Kitten, 2 + dx, 2 + dy);
        let result = g
            .apply(
                0,
                Action::Place {
                    kind: Kind::Kitten,
                    x: 2,
                    y: 2,
                },
            )
            .unwrap();
        assert_eq!(
            result.state.pieces[id as usize].pos,
            Some(Pos {
                x: 2 + 2 * dx,
                y: 2 + 2 * dy
            })
        );
        assert_eq!(result.effects.len(), 2);
        assert_eq!(result.state.turn, 1);
    }
}

#[test]
fn blocked_pieces_do_not_move_or_cause_chain_reactions() {
    let mut g = GameState::new(0);
    let near = put(&mut g, 1, Kind::Kitten, 2, 2);
    let far = put(&mut g, 0, Kind::Kitten, 3, 2);
    let next = place(&g, Kind::Kitten, 1, 2);
    assert_eq!(next.pieces[near as usize].pos, Some(Pos { x: 2, y: 2 }));
    assert_eq!(next.pieces[far as usize].pos, Some(Pos { x: 3, y: 2 }));
}

#[test]
fn moving_piece_does_not_nudge_its_new_neighbor() {
    let mut g = GameState::new(0);
    let near = put(&mut g, 1, Kind::Kitten, 2, 2);
    let beyond = put(&mut g, 1, Kind::Kitten, 4, 2);
    let next = place(&g, Kind::Kitten, 1, 2);
    assert_eq!(next.pieces[near as usize].pos, Some(Pos { x: 3, y: 2 }));
    assert_eq!(next.pieces[beyond as usize].pos, Some(Pos { x: 4, y: 2 }));
}

#[test]
fn edge_nudges_return_pieces_to_their_owners_pool() {
    for (x, y, px, py) in [
        (1, 2, 0, 2),
        (4, 2, 5, 2),
        (2, 1, 2, 0),
        (2, 4, 2, 5),
        (1, 1, 0, 0),
    ] {
        let mut g = GameState::new(0);
        let id = put(&mut g, 1, Kind::Kitten, px, py);
        assert_eq!(place(&g, Kind::Kitten, x, y).pieces[id as usize].pos, None);
    }
}

#[test]
fn kittens_cannot_nudge_cats_but_cats_can() {
    let mut g = GameState::new(0);
    let id = put(&mut g, 1, Kind::Cat, 2, 2);
    assert_eq!(
        place(&g, Kind::Kitten, 1, 2).pieces[id as usize].pos,
        Some(Pos { x: 2, y: 2 })
    );
    g.pieces[0].kind = Kind::Cat;
    assert_eq!(
        place(&g, Kind::Cat, 1, 2).pieces[id as usize].pos,
        Some(Pos { x: 3, y: 2 })
    );
}

#[test]
fn a_single_mixed_line_graduates_into_the_pool() {
    let mut g = GameState::new(0);
    let a = put(&mut g, 0, Kind::Kitten, 1, 2);
    let b = put(&mut g, 0, Kind::Cat, 2, 2);
    let next = place(&g, Kind::Kitten, 3, 2);
    for id in [a, b, 2] {
        assert_eq!(next.pieces[id as usize].kind, Kind::Cat);
        assert_eq!(next.pieces[id as usize].pos, None);
    }
    assert_eq!(next.turn, 1);
}

#[test]
fn overlapping_lines_require_one_choice_and_keep_the_turn() {
    let mut g = GameState::new(0);
    for x in 0..4 {
        put(&mut g, 0, Kind::Kitten, x, 0);
    }
    let next = place(&g, Kind::Kitten, 5, 5);
    let Phase::Graduation { options } = &next.phase else {
        panic!("expected graduation");
    };
    assert_eq!(options.len(), 2);
    assert_eq!(next.turn, 0);
    let selected = options[0].clone();
    let resolved = next
        .apply(0, Action::Graduate { pieces: selected })
        .unwrap()
        .state;
    assert_eq!(resolved.turn, 1);
    assert_eq!(
        resolved
            .pieces
            .iter()
            .filter(|p| p.owner == 0 && p.pos.is_some())
            .count(),
        2
    );
    assert_eq!(
        resolved
            .pieces
            .iter()
            .filter(|p| p.owner == 0 && p.kind == Kind::Cat)
            .count(),
        3
    );
}

#[test]
fn eight_pieces_allow_retrieving_a_cat_or_graduating_a_kitten() {
    let mut g = GameState::new(0);
    for (i, (x, y)) in [(0, 0), (2, 0), (4, 0), (1, 2), (3, 2), (5, 2), (0, 4)]
        .into_iter()
        .enumerate()
    {
        put(
            &mut g,
            0,
            if i == 0 { Kind::Cat } else { Kind::Kitten },
            x,
            y,
        );
    }
    let next = place(&g, Kind::Kitten, 5, 5);
    let Phase::Graduation { options } = &next.phase else {
        panic!("expected graduation");
    };
    assert_eq!(options.len(), 8);
    for id in [0, 1] {
        let done = next
            .apply(0, Action::Graduate { pieces: vec![id] })
            .unwrap()
            .state;
        assert_eq!(done.pieces[id as usize].kind, Kind::Cat);
        assert_eq!(done.pieces[id as usize].pos, None);
        assert_eq!(done.turn, 1);
    }
}

#[test]
fn three_cats_win_after_movement_in_every_line_direction() {
    for (dx, dy) in [(1, 0), (0, 1), (1, 1), (-1, 1)] {
        let mut g = GameState::new(0);
        put(&mut g, 0, Kind::Cat, 2 - dx, 2 - dy);
        put(&mut g, 0, Kind::Cat, 2, 2);
        g.pieces[2].kind = Kind::Cat;
        let done = place(&g, Kind::Cat, 2 + dx, 2 + dy);
        assert!(matches!(done.phase, Phase::Finished { winner: 0, .. }));
    }
}

#[test]
fn eight_adult_cats_on_the_bed_win() {
    let mut g = GameState::new(0);
    for (x, y) in [(0, 0), (2, 0), (4, 0), (1, 2), (3, 2), (5, 2), (0, 4)] {
        put(&mut g, 0, Kind::Cat, x, y);
    }
    g.pieces[7].kind = Kind::Cat;
    assert!(matches!(
        place(&g, Kind::Cat, 5, 5).phase,
        Phase::Finished { winner: 0, .. }
    ));
}

#[test]
fn opponent_line_does_not_win_on_the_active_players_turn() {
    let mut g = GameState::new(0);
    for x in 0..3 {
        put(&mut g, 1, Kind::Cat, x, 0);
    }
    assert!(matches!(
        place(&g, Kind::Kitten, 5, 5).phase,
        Phase::Placement
    ));
}

#[test]
fn illegal_moves_leave_the_original_state_unchanged() {
    let mut g = GameState::new(0);
    put(&mut g, 1, Kind::Kitten, 2, 2);
    let original = serde_json::to_value(&g).unwrap();
    for action in [
        Action::Place {
            kind: Kind::Kitten,
            x: -1,
            y: 0,
        },
        Action::Place {
            kind: Kind::Kitten,
            x: 6,
            y: 0,
        },
        Action::Place {
            kind: Kind::Kitten,
            x: 2,
            y: 2,
        },
        Action::Place {
            kind: Kind::Cat,
            x: 0,
            y: 0,
        },
        Action::Graduate { pieces: vec![0] },
    ] {
        assert!(g.apply(0, action).is_err());
        assert_eq!(serde_json::to_value(&g).unwrap(), original);
    }
    assert!(
        g.apply(
            1,
            Action::Place {
                kind: Kind::Kitten,
                x: 0,
                y: 0
            }
        )
        .is_err()
    );
    assert!(g.apply(2, Action::Resign).is_err());
}

#[test]
fn graduation_blocks_placement_and_rejects_invalid_selection() {
    let mut g = GameState::new(0);
    for x in 0..4 {
        put(&mut g, 0, Kind::Kitten, x, 0);
    }
    let pending = place(&g, Kind::Kitten, 5, 5);
    assert!(
        pending
            .apply(
                0,
                Action::Place {
                    kind: Kind::Kitten,
                    x: 4,
                    y: 4
                }
            )
            .is_err()
    );
    assert!(
        pending
            .apply(
                0,
                Action::Graduate {
                    pieces: vec![0, 0, 1]
                }
            )
            .is_err()
    );
}

#[test]
fn resignation_finishes_and_finished_games_reject_actions() {
    let g = GameState::new(0);
    let done = g.apply(1, Action::Resign).unwrap().state;
    assert!(matches!(done.phase, Phase::Finished { winner: 0, .. }));
    assert!(
        done.apply(
            0,
            Action::Place {
                kind: Kind::Kitten,
                x: 0,
                y: 0
            }
        )
        .is_err()
    );
    assert!(done.apply(0, Action::Resign).is_err());
}

#[test]
fn effects_distinguish_placement_nudges_and_adult_graduation() {
    let mut g = GameState::new(0);
    put(&mut g, 1, Kind::Cat, 0, 0);
    let transition = g.apply(
        0,
        Action::Place {
            kind: Kind::Cat,
            x: 1,
            y: 1,
        },
    );
    // Make a cat available to place.
    assert!(transition.is_err());
    g.pieces[0].kind = Kind::Cat;
    let transition = g
        .apply(
            0,
            Action::Place {
                kind: Kind::Cat,
                x: 1,
                y: 1,
            },
        )
        .unwrap();
    let effects = serde_json::to_value(&transition.effects).unwrap();
    assert_eq!(effects[0]["motion"], "place");
    assert_eq!(effects[1]["motion"], "nudge");
    assert!(effects[1]["to"].is_null());

    let mut g = GameState::new(0);
    let adult = put(&mut g, 0, Kind::Cat, 0, 0);
    put(&mut g, 0, Kind::Kitten, 2, 0);
    let t = g
        .apply(
            0,
            Action::Place {
                kind: Kind::Kitten,
                x: 4,
                y: 4,
            },
        )
        .unwrap();
    let mut state = t.state;
    state.turn = 0;
    state.phase = Phase::Graduation {
        options: vec![vec![adult]],
    };
    let t = state
        .apply(
            0,
            Action::Graduate {
                pieces: vec![adult],
            },
        )
        .unwrap();
    let effects = serde_json::to_value(&t.effects).unwrap();
    assert_eq!(effects[0]["motion"], "graduate");
    assert_eq!(effects[0]["kind"], "cat");
    assert!(effects[0]["to"].is_null());
}
