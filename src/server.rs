use crate::game::{Action, Effect, GameState, Phase};
use axum::{
    Json, Router,
    extract::{MatchedPath, OriginalUri, Path, Request, State},
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
use tokio::sync::{broadcast, watch};
use tokio_stream::{Stream, StreamExt};
use uuid::Uuid;

#[derive(Clone)]
pub struct App {
    pub pool: SqlitePool,
    updates: broadcast::Sender<Notice>,
    secure_cookie: bool,
    shutdown: watch::Sender<bool>,
    public_origin: String,
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
    rematch: Rematch,
}

#[derive(Clone, Default, Serialize)]
struct Rematch {
    requested_by: Option<usize>,
    game_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum RematchAction {
    Request,
    Accept,
    Decline,
    Cancel,
}

#[derive(Deserialize)]
struct RematchInput {
    revision: i64,
    action: RematchAction,
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
    code: Option<&'static str>,
}

impl ApiError {
    fn new(status: StatusCode, message: &str) -> Self {
        Self {
            status,
            message: message.into(),
            current: None,
            code: None,
        }
    }
}

impl ApiError {
    fn coded(status: StatusCode, code: &'static str, message: &str) -> Self {
        Self {
            code: Some(code),
            ..Self::new(status, message)
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        tracing::warn!(
            status = self.status.as_u16(),
            reason = self.code.unwrap_or("request_rejected"),
            "request rejected"
        );
        (
            self.status,
            Json(json!({"error":self.message,"current":self.current,"code":self.code})),
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
    pub fn with_public_origin(
        mut self,
        origin: &str,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let uri: axum::http::Uri = origin.parse()?;
        let authority = uri
            .authority()
            .ok_or("PUBLIC_ORIGIN needs an HTTP(S) authority")?;
        let raw = authority.as_str();
        let port = if raw.starts_with('[') {
            raw.split_once(']')
                .and_then(|(_, suffix)| suffix.strip_prefix(':'))
        } else {
            raw.split_once(':').map(|(_, port)| port)
        };
        if !matches!(uri.scheme_str(), Some("http" | "https"))
            || authority.as_str().contains('@')
            || authority.host().is_empty()
            || uri.query().is_some()
            || !matches!(uri.path(), "" | "/")
            || origin.contains(['#', '\\'])
            || port.is_some_and(|port| port.parse::<u16>().is_err())
        {
            return Err("PUBLIC_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment".into());
        }
        self.public_origin = origin.trim_end_matches('/').to_owned();
        Ok(self)
    }

    pub fn begin_shutdown(&self) {
        self.shutdown.send_replace(true);
    }

    pub async fn open(
        url: &str,
        secure_cookie: bool,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        Self::open_database(url, secure_cookie, true).await
    }

    pub async fn open_existing(
        url: &str,
        secure_cookie: bool,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        Self::open_database(url, secure_cookie, false).await
    }

    async fn open_database(
        url: &str,
        secure_cookie: bool,
        create: bool,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let options = SqliteConnectOptions::from_str(url)?
            .create_if_missing(create)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        {
            let mut rows = sqlx::query("SELECT state FROM games").fetch(&pool);
            while let Some(row) = rows.next().await {
                let row = row?;
                serde_json::from_str::<GameState>(row.get("state"))?;
            }
        }
        let (updates, _) = broadcast::channel(64);
        let (shutdown, _) = watch::channel(false);
        Ok(Self {
            pool,
            updates,
            secure_cookie,
            shutdown,
            public_origin: "http://localhost:3000".into(),
        })
    }
}

pub fn router(app: App) -> Router {
    Router::new()
        .route(
            "/vendor/open-props.min.css",
            get(|| async {
                asset(
                    "text/css; charset=utf-8",
                    include_str!("../web/vendor/open-props.min.css"),
                )
            }),
        )
        .route(
            "/vendor/animate.min.css",
            get(|| async {
                asset(
                    "text/css; charset=utf-8",
                    include_str!("../web/vendor/animate.min.css"),
                )
            }),
        )
        .route(
            "/link-preview-v1.png",
            get(|| async {
                (
                    [
                        (header::CONTENT_TYPE, "image/png"),
                        (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
                    ],
                    &include_bytes!("../web/link-preview-v1.png")[..],
                )
            }),
        )
        .route("/", get(index))
        .route("/game/{id}", get(index))
        .route("/invite/{id}", get(index))
        .route(
            "/app.js",
            get(|| async {
                asset(
                    "text/javascript; charset=utf-8",
                    include_str!("../web/app.js"),
                )
            }),
        )
        .route(
            "/state.mjs",
            get(|| async {
                asset(
                    "text/javascript; charset=utf-8",
                    include_str!("../web/state.mjs"),
                )
            }),
        )
        .route(
            "/style.css",
            get(|| async { asset("text/css; charset=utf-8", include_str!("../web/style.css")) }),
        )
        .route(
            "/cat.svg",
            get(|| async { asset("image/svg+xml", include_str!("../web/cat.svg")) }),
        )
        .route(
            "/adult.svg",
            get(|| async { asset("image/svg+xml", include_str!("../web/adult.svg")) }),
        )
        .route(
            "/hero.svg",
            get(|| async { asset("image/svg+xml", include_str!("../web/hero.svg")) }),
        )
        .route("/api/me", get(me))
        .route("/api/session/reset", post(reset_invalid_session))
        .route("/api/games", post(create))
        .route("/api/games/{id}", get(read))
        .route("/api/games/{id}/invite", get(invite_status))
        .route("/api/games/{id}/join", post(join))
        .route("/api/games/{id}/actions", post(act))
        .route("/api/games/{id}/rematch", post(rematch))
        .route("/api/games/{id}/events", get(events))
        .route("/health", get(|| async { "ok" }))
        .layer(axum::middleware::from_fn_with_state(app.clone(), admission))
        .with_state(app)
}

async fn index(State(app): State<App>, OriginalUri(uri): OriginalUri) -> Response {
    let invite = uri.path().starts_with("/invite/");
    let title = if invite {
        "You’re invited to the quilt"
    } else if uri.path().starts_with("/game/") {
        "A quilt for two"
    } else {
        "Cats, quilts & a little strategy"
    };
    let description = if invite {
        "Join your partner for a cozy game of cats and strategy."
    } else {
        "A cozy game of cats and strategy for two."
    };
    let image = format!("{}/link-preview-v1.png", app.public_origin);
    let url = format!("{}{}", app.public_origin, uri.path());
    let alt = "Peach and sage cats cuddling on a stitched blue quilt";
    let mut metadata = String::new();
    for (property, value) in [
        ("og:type", "website"),
        ("og:site_name", "Quiltfall"),
        ("og:title", title),
        ("og:description", description),
        ("og:url", &url),
        ("og:image", &image),
        ("og:image:type", "image/png"),
        ("og:image:width", "1200"),
        ("og:image:height", "630"),
        ("og:image:alt", alt),
    ] {
        metadata.push_str(&format!(
            "<meta property=\"{property}\" content=\"{}\" />\n",
            escape_attribute(value)
        ));
    }
    for (name, value) in [
        ("twitter:card", "summary_large_image"),
        ("twitter:title", title),
        ("twitter:description", description),
        ("twitter:image", &image),
        ("twitter:image:alt", alt),
    ] {
        metadata.push_str(&format!(
            "<meta name=\"{name}\" content=\"{}\" />\n",
            escape_attribute(value)
        ));
    }
    (
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        include_str!("../web/index.html").replace("<!-- link-preview -->", &metadata),
    )
        .into_response()
}

fn escape_attribute(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\"', "&quot;")
        .replace('\'', "&#39;")
}

fn asset(content_type: &'static str, body: &'static str) -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        body,
    )
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
    let token = cookie_token(headers).ok_or_else(|| {
        ApiError::coded(
            StatusCode::UNAUTHORIZED,
            "session_missing",
            "This browser no longer has your game session.",
        )
    })?;
    let row = sqlx::query("SELECT id,name FROM players WHERE token_hash=?")
        .bind(token_hash(token))
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| {
            ApiError::coded(
                StatusCode::UNAUTHORIZED,
                "session_invalid",
                "This browser’s game session could not be recognized.",
            )
        })?;
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
        Err(error) if error.code == Some("session_missing") => {}
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
        .ok_or_else(|| ApiError::coded(StatusCode::NOT_FOUND,"game_not_found","That game link was not found."))?;
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
        rematch: Rematch {
            requested_by: row
                .get::<Option<i64>, _>("rematch_requested_by")
                .map(|seat| seat as usize),
            game_id: row.get("rematch_game_id"),
        },
    })
}

fn seat(game: &Game, player: &Player) -> Result<usize, ApiError> {
    game.players
        .iter()
        .position(|p| p.id == player.id)
        .ok_or_else(|| {
            ApiError::coded(
                StatusCode::FORBIDDEN,
                "not_a_member",
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
                rematch: Rematch::default(),
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
        return Err(ApiError::coded(
            StatusCode::CONFLICT,
            "game_full",
            "Both seats are taken.",
        ));
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
    let game = load_game(&mut conn, id).await?;
    let player = identity(&mut conn, headers).await?;
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
            code: None,
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

async fn rematch(
    State(app): State<App>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<RematchInput>,
) -> Result<Json<Snapshot>, ApiError> {
    let mut tx = app.pool.begin().await?;
    let player = identity(&mut tx, &headers).await?;
    let mut game = load_game(&mut tx, &id).await?;
    let you = seat(&game, &player)?;
    if game.players.len() != 2 || !matches!(game.state.phase, Phase::Finished { .. }) {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Finish this quilt before offering another round.",
        ));
    }
    // Retrying an offer/accept after a lost response must reuse the saved result.
    if (game.rematch.game_id.is_some()
        && matches!(input.action, RematchAction::Request | RematchAction::Accept))
        || (game.rematch.requested_by == Some(you)
            && matches!(input.action, RematchAction::Request))
    {
        tx.commit().await?;
        return Ok(Json(Snapshot {
            game,
            you,
            effects: vec![],
        }));
    }
    if game.revision != input.revision {
        return Err(ApiError {
            status: StatusCode::CONFLICT,
            code: None,
            message: "The rematch offer has changed. Check the updated offer.".into(),
            current: Some(Box::new(Snapshot {
                game,
                you,
                effects: vec![],
            })),
        });
    }
    match input.action {
        RematchAction::Request => {
            if game.rematch.requested_by.is_some() {
                tx.commit().await?;
                return Ok(Json(Snapshot {
                    game,
                    you,
                    effects: vec![],
                }));
            }
            game.rematch.requested_by = Some(you);
        }
        RematchAction::Accept => {
            if game.rematch.requested_by != Some(1 - you) {
                return Err(ApiError::new(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "Only your partner can accept your offer.",
                ));
            }
            let next_id = Uuid::new_v4().simple().to_string();
            let state = GameState::new(Uuid::new_v4().as_bytes()[0] % 2);
            sqlx::query(
                "INSERT INTO games(id,host_id,guest_id,state,created_at) VALUES(?,?,?,?,?)",
            )
            .bind(&next_id)
            .bind(&game.players[0].id)
            .bind(&game.players[1].id)
            .bind(serde_json::to_string(&state)?)
            .bind(now())
            .execute(&mut *tx)
            .await?;
            game.rematch.requested_by = None;
            game.rematch.game_id = Some(next_id);
        }
        RematchAction::Decline | RematchAction::Cancel => {
            let expected = match input.action {
                RematchAction::Decline => 1 - you,
                _ => you,
            };
            if game.rematch.requested_by != Some(expected) {
                return Err(ApiError::new(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "That offer is no longer available to change.",
                ));
            }
            game.rematch.requested_by = None;
        }
    }
    game.revision += 1;
    sqlx::query("UPDATE games SET rematch_requested_by=?,rematch_game_id=?,revision=? WHERE id=?")
        .bind(game.rematch.requested_by.map(|seat| seat as i64))
        .bind(&game.rematch.game_id)
        .bind(game.revision)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let _ = app.updates.send(Notice {
        game: game.clone(),
        effects: vec![],
    });
    Ok(Json(Snapshot {
        game,
        you,
        effects: vec![],
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
    let mut shutdown = app.shutdown.subscribe();
    let initial = authorized_game(&app, &id, &headers).await?;
    let you = initial.you;
    let mut revision = initial.game.revision;
    let stream = async_stream::stream! {
        yield Ok(snapshot_event(&initial));
        loop {
            if *shutdown.borrow() { break; }
            let notice = tokio::select! {
                biased;
                _ = shutdown.changed() => break,
                notice = rx.recv() => notice,
            };
            let next = match notice {
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

async fn invite_status(
    State(app): State<App>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let guest: Option<String> = sqlx::query_scalar("SELECT guest_id FROM games WHERE id=?")
        .bind(id)
        .fetch_optional(&app.pool)
        .await?
        .ok_or_else(|| {
            ApiError::coded(
                StatusCode::NOT_FOUND,
                "game_not_found",
                "That game link was not found.",
            )
        })?;
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(json!({"joinable":guest.is_none()})),
    ))
}

async fn admission(
    State(app): State<App>,
    request: Request,
    next: axum::middleware::Next,
) -> Response {
    if *app.shutdown.borrow() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "Server restarting. Please retry.",
        )
            .into_response();
    }
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(|path| path.as_str())
        .unwrap_or("unmatched")
        .to_owned();
    let cookie_present = cookie_token(request.headers()).is_some();
    let response = next.run(request).await;
    tracing::info!(
        route,
        status = response.status().as_u16(),
        cookie_present,
        machine = std::env::var("FLY_MACHINE_ID").unwrap_or_else(|_| "local".into()),
        "request completed"
    );
    response
}

#[derive(Deserialize)]
struct SessionResetInput {
    reset_invalid_session: bool,
}

async fn reset_invalid_session(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<SessionResetInput>,
) -> Result<Response, ApiError> {
    if !input.reset_invalid_session {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Confirm clearing the unrecognized session.",
        ));
    }
    let mut conn = app.pool.acquire().await?;
    match identity(&mut conn, &headers).await {
        Ok(_) => {
            return Err(ApiError::new(
                StatusCode::CONFLICT,
                "Your session is still valid. Keep using your saved games.",
            ));
        }
        Err(error) if matches!(error.code, Some("session_missing" | "session_invalid")) => {}
        Err(error) => return Err(error),
    }
    let cookie = format!(
        "quiltfall_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{}",
        if app.secure_cookie { "; Secure" } else { "" }
    );
    Ok((
        [
            (header::SET_COOKIE, cookie),
            (header::CACHE_CONTROL, "no-store".into()),
        ],
        Json(json!({"cleared":true})),
    )
        .into_response())
}
