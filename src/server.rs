use crate::game::{Action, Effect, GameState, Phase};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{
    Row, SqliteConnection, SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::{
    convert::Infallible,
    str::FromStr,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::broadcast;
use tokio_stream::Stream;
use uuid::Uuid;

#[derive(Clone)]
pub struct App {
    pub pool: SqlitePool,
    updates: broadcast::Sender<Notice>,
    secure_cookie: bool,
}

#[derive(Clone)]
struct Notice {
    game: Game,
    effects: Vec<Effect>,
}

#[derive(Clone, Serialize)]
struct Player {
    id: String,
    name: String,
}

#[derive(Clone, Serialize)]
struct Game {
    id: String,
    players: Vec<Player>,
    state: GameState,
    revision: i64,
    created_at: i64,
    ended_at: Option<i64>,
}

#[derive(Serialize)]
struct Snapshot {
    game: Game,
    you: usize,
    effects: Vec<Effect>,
}

struct ApiError {
    status: StatusCode,
    message: String,
    current: Option<Box<Snapshot>>,
}

impl ApiError {
    fn new(status: StatusCode, message: &str) -> Self {
        Self {
            status,
            message: message.into(),
            current: None,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({"error":self.message,"current":self.current})),
        )
            .into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        tracing::error!(%error, "database operation failed");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not save the game. Please try again.",
        )
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(error: serde_json::Error) -> Self {
        tracing::error!(%error, "stored game could not be decoded");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not load this game.",
        )
    }
}

impl App {
    pub async fn open(
        url: &str,
        secure_cookie: bool,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let options = SqliteConnectOptions::from_str(url)?
            .create_if_missing(true)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        let (updates, _) = broadcast::channel(64);
        Ok(Self {
            pool,
            updates,
            secure_cookie,
        })
    }
}

pub fn router(app: App) -> Router {
    Router::new()
        .route("/api/me", get(me))
        .route("/api/games", post(create))
        .route("/api/games/{id}", get(read))
        .route("/api/games/{id}/join", post(join))
        .route("/api/games/{id}/actions", post(act))
        .route("/api/games/{id}/events", get(events))
        .route("/health", get(|| async { "ok" }))
        .with_state(app)
}

#[derive(Deserialize)]
struct NameInput {
    name: String,
}

#[derive(Deserialize)]
struct ActionInput {
    revision: i64,
    action: Action,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock predates epoch")
        .as_secs() as i64
}

fn token_hash(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

fn cookie_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find_map(|(name, value)| (name == "quiltfall_session").then_some(value))
}

async fn identity(conn: &mut SqliteConnection, headers: &HeaderMap) -> Result<Player, ApiError> {
    let token = cookie_token(headers)
        .ok_or_else(|| ApiError::new(StatusCode::UNAUTHORIZED, "Enter your name to join."))?;
    let row = sqlx::query("SELECT id,name FROM players WHERE token_hash=?")
        .bind(token_hash(token))
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| ApiError::new(StatusCode::UNAUTHORIZED, "Enter your name to join."))?;
    Ok(Player {
        id: row.get("id"),
        name: row.get("name"),
    })
}

async fn identity_or_create(
    conn: &mut SqliteConnection,
    headers: &HeaderMap,
    name: &str,
    secure: bool,
) -> Result<(Player, HeaderMap), ApiError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 32 || name.chars().any(char::is_control) {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Use a name between 1 and 32 characters.",
        ));
    }
    match identity(conn, headers).await {
        Ok(player) => return Ok((player, HeaderMap::new())),
        Err(error) if error.status == StatusCode::UNAUTHORIZED => {}
        Err(error) => return Err(error),
    }
    let token = Uuid::new_v4().simple().to_string();
    let player = Player {
        id: Uuid::new_v4().to_string(),
        name: name.into(),
    };
    sqlx::query("INSERT INTO players(id,token_hash,name) VALUES(?,?,?)")
        .bind(&player.id)
        .bind(token_hash(&token))
        .bind(&player.name)
        .execute(conn)
        .await?;
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        header::SET_COOKIE,
        format!(
            "quiltfall_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000{}",
            if secure { "; Secure" } else { "" }
        )
        .parse()
        .expect("UUID cookie is a valid header"),
    );
    Ok((player, response_headers))
}

async fn load_game(conn: &mut SqliteConnection, id: &str) -> Result<Game, ApiError> {
    let row = sqlx::query("SELECT g.*,h.name AS host_name,p.name AS guest_name FROM games g JOIN players h ON h.id=g.host_id LEFT JOIN players p ON p.id=g.guest_id WHERE g.id=?")
        .bind(id).fetch_optional(conn).await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND,"That game link was not found."))?;
    let mut players = vec![Player {
        id: row.get("host_id"),
        name: row.get("host_name"),
    }];
    if let Some(guest_id) = row.get::<Option<String>, _>("guest_id") {
        players.push(Player {
            id: guest_id,
            name: row.get("guest_name"),
        });
    }
    Ok(Game {
        id: id.into(),
        players,
        state: serde_json::from_str(row.get::<&str, _>("state"))?,
        revision: row.get("revision"),
        created_at: row.get("created_at"),
        ended_at: row.get("ended_at"),
    })
}

fn seat(game: &Game, player: &Player) -> Result<usize, ApiError> {
    game.players
        .iter()
        .position(|p| p.id == player.id)
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::FORBIDDEN,
                "This game belongs to two other players.",
            )
        })
}

async fn create(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<NameInput>,
) -> Result<Response, ApiError> {
    let mut tx = app.pool.begin().await?;
    let (player, response_headers) =
        identity_or_create(&mut tx, &headers, &input.name, app.secure_cookie).await?;
    let id = Uuid::new_v4().simple().to_string();
    let first = Uuid::new_v4().as_bytes()[0] % 2;
    let state = GameState::new(first);
    let created_at = now();
    sqlx::query("INSERT INTO games(id,host_id,state,created_at) VALUES(?,?,?,?)")
        .bind(&id)
        .bind(&player.id)
        .bind(serde_json::to_string(&state)?)
        .bind(created_at)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        response_headers,
        Json(Snapshot {
            game: Game {
                id,
                players: vec![player],
                state,
                revision: 0,
                created_at,
                ended_at: None,
            },
            you: 0,
            effects: vec![],
        }),
    )
        .into_response())
}

async fn join(
    State(app): State<App>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<NameInput>,
) -> Result<Response, ApiError> {
    let mut tx = app.pool.begin().await?;
    let mut game = load_game(&mut tx, &id).await?;
    let (player, response_headers) =
        identity_or_create(&mut tx, &headers, &input.name, app.secure_cookie).await?;
    if let Ok(you) = seat(&game, &player) {
        tx.commit().await?;
        return Ok((
            response_headers,
            Json(Snapshot {
                game,
                you,
                effects: vec![],
            }),
        )
            .into_response());
    }
    if game.players.len() == 2 {
        return Err(ApiError::new(StatusCode::CONFLICT, "Both seats are taken."));
    }
    sqlx::query("UPDATE games SET guest_id=?,revision=revision+1 WHERE id=?")
        .bind(&player.id)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    game.players.push(player);
    game.revision += 1;
    tx.commit().await?;
    let _ = app.updates.send(Notice {
        game: game.clone(),
        effects: vec![],
    });
    Ok((
        response_headers,
        Json(Snapshot {
            game,
            you: 1,
            effects: vec![],
        }),
    )
        .into_response())
}

async fn authorized_game(app: &App, id: &str, headers: &HeaderMap) -> Result<Snapshot, ApiError> {
    let mut conn = app.pool.acquire().await?;
    let player = identity(&mut conn, headers).await?;
    let game = load_game(&mut conn, id).await?;
    let you = seat(&game, &player)?;
    Ok(Snapshot {
        game,
        you,
        effects: vec![],
    })
}

async fn read(
    State(app): State<App>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Snapshot>, ApiError> {
    Ok(Json(authorized_game(&app, &id, &headers).await?))
}

async fn act(
    State(app): State<App>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<ActionInput>,
) -> Result<Json<Snapshot>, ApiError> {
    let mut tx = app.pool.begin().await?;
    let player = identity(&mut tx, &headers).await?;
    let mut game = load_game(&mut tx, &id).await?;
    let you = seat(&game, &player)?;
    if game.revision != input.revision {
        return Err(ApiError {
            status: StatusCode::CONFLICT,
            message: "The board has changed. Try again on the updated board.".into(),
            current: Some(Box::new(Snapshot {
                game,
                you,
                effects: vec![],
            })),
        });
    }
    if game.players.len() < 2 {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "Your partner needs to join first.",
        ));
    }
    let result = game
        .state
        .apply(you as u8, input.action)
        .map_err(|message| ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, message))?;
    game.state = result.state;
    game.revision += 1;
    let winner_id = if let Phase::Finished { winner, .. } = game.state.phase {
        game.ended_at = Some(now());
        Some(game.players[winner as usize].id.clone())
    } else {
        None
    };
    sqlx::query("UPDATE games SET state=?,revision=?,ended_at=?,winner_id=? WHERE id=?")
        .bind(serde_json::to_string(&game.state)?)
        .bind(game.revision)
        .bind(game.ended_at)
        .bind(winner_id)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let _ = app.updates.send(Notice {
        game: game.clone(),
        effects: result.effects.clone(),
    });
    Ok(Json(Snapshot {
        game,
        you,
        effects: result.effects,
    }))
}

async fn me(
    State(app): State<App>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut conn = app.pool.acquire().await?;
    let player = identity(&mut conn, &headers).await?;
    let rows = sqlx::query("SELECT g.id,g.created_at,g.ended_at,g.winner_id,g.guest_id,h.name AS host_name,p.name AS guest_name,g.host_id FROM games g JOIN players h ON h.id=g.host_id LEFT JOIN players p ON p.id=g.guest_id WHERE g.host_id=? OR g.guest_id=? ORDER BY g.created_at DESC,g.id")
        .bind(&player.id).bind(&player.id).fetch_all(&mut *conn).await?;
    let mut active = Vec::new();
    let mut history = Vec::new();
    let mut wins = 0;
    for row in rows {
        let ended_at = row.get::<Option<i64>, _>("ended_at");
        let won = row.get::<Option<String>, _>("winner_id").as_deref() == Some(&player.id);
        let opponent: Option<String> = if row.get::<String, _>("host_id") == player.id {
            row.get("guest_name")
        } else {
            Some(row.get("host_name"))
        };
        let summary = json!({"id":row.get::<String,_>("id"),"opponent":opponent,"created_at":row.get::<i64,_>("created_at"),"ended_at":ended_at,"won":won});
        if ended_at.is_some() {
            if won {
                wins += 1;
            }
            history.push(summary);
        } else {
            active.push(summary);
        }
    }
    Ok(Json(
        json!({"player":player,"active":active,"stats":{"played":history.len(),"wins":wins,"losses":history.len()-wins},"history":history}),
    ))
}

async fn events(
    State(app): State<App>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiError> {
    // Subscribe first so a move committed while the snapshot is loading is queued.
    let mut rx = app.updates.subscribe();
    let initial = authorized_game(&app, &id, &headers).await?;
    let you = initial.you;
    let mut revision = initial.game.revision;
    let stream = async_stream::stream! {
        yield Ok(snapshot_event(&initial));
        loop {
            let next = match rx.recv().await {
                Ok(notice) if notice.game.id == id => Snapshot { game:notice.game,you,effects:notice.effects },
                Ok(_) => continue,
                Err(broadcast::error::RecvError::Lagged(_)) => match authorized_game(&app,&id,&headers).await {
                    Ok(snapshot) => snapshot,
                    Err(_) => break,
                },
                Err(broadcast::error::RecvError::Closed) => break,
            };
            if next.game.revision > revision {
                revision = next.game.revision;
                yield Ok(snapshot_event(&next));
            }
        }
    };
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))))
}

fn snapshot_event(snapshot: &Snapshot) -> Event {
    Event::default()
        .event("snapshot")
        .id(snapshot.game.revision.to_string())
        .data(serde_json::to_string(snapshot).expect("game snapshot serializes"))
}
