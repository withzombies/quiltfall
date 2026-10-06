use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
    response::Response,
};
use http_body_util::BodyExt;
use quiltfall::{
    game::{GameState, Kind, Phase, Pos},
    server::{App, router},
};
use serde_json::{Value, json};
use tower::ServiceExt;

#[tokio::test]
async fn serves_the_phone_app_on_home_and_invite_urls() {
    let (_, router) = app().await;
    for path in ["/", "/game/a-private-invite"] {
        let response = request(&router, "GET", path, "", json!(null)).await;
        assert_eq!(response.status(), StatusCode::OK);
        let html = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert!(html.contains("Quiltfall"));
        assert!(html.contains("viewport"));
        assert!(html.contains("/vendor/open-props.min.css"));
        assert!(html.contains("/vendor/animate.min.css"));
    }
    for (path, content_type) in [
        ("/app.js", "text/javascript"),
        ("/style.css", "text/css"),
        ("/cat.svg", "image/svg+xml"),
        ("/state.mjs", "text/javascript"),
    ] {
        let response = request(&router, "GET", path, "", json!(null)).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(
            response.headers()["content-type"]
                .to_str()
                .unwrap()
                .starts_with(content_type)
        );
    }
    assert_eq!(
        request(&router, "GET", "/missing", "", json!(null))
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
}

async fn app() -> (App, Router) {
    let state = App::open("sqlite::memory:", false).await.unwrap();
    let router = router(state.clone());
    (state, router)
}

#[tokio::test]
async fn previews_are_public_configured_and_have_no_database_side_effects() {
    let (state, router) = app().await;
    for (path, title) in [
        ("/", "Cats, quilts &amp; a little strategy"),
        ("/invite/private?tracking=1", "You’re invited to the quilt"),
        ("/game/private", "A quilt for two"),
    ] {
        let response = request(&router, "GET", path, "", json!(null)).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(!response.headers().contains_key("set-cookie"));
        let html = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert!(html.contains(&format!("property=\"og:title\" content=\"{title}\"")));
        assert!(html.contains("http://localhost:3000/link-preview-v1.png"));
        assert!(html.contains("summary_large_image"));
        assert!(!html.contains("tracking=1"));
        assert!(html.contains("property=\"og:image:width\" content=\"1200\""));
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM players")
            .fetch_one(&state.pool)
            .await
            .unwrap(),
        0
    );
    let image = request(&router, "GET", "/link-preview-v1.png", "", json!(null)).await;
    assert_eq!(image.headers()["content-type"], "image/png");
    assert!(
        image.headers()["cache-control"]
            .to_str()
            .unwrap()
            .contains("immutable")
    );
    let bytes = image.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    assert_eq!(u32::from_be_bytes(bytes[16..20].try_into().unwrap()), 1200);
    assert_eq!(u32::from_be_bytes(bytes[20..24].try_into().unwrap()), 630);
    assert!(bytes.len() < 1024 * 1024);
}

#[tokio::test]
async fn draining_rejects_new_requests_and_ends_open_event_streams() {
    let (state, router) = app().await;
    let (id, cookie, _) = create(&router, "Host").await;
    let response = request(
        &router,
        "GET",
        &format!("/api/games/{id}/events"),
        &cookie,
        json!(null),
    )
    .await;
    let mut stream = response.into_body();
    assert!(stream.frame().await.unwrap().is_ok());
    state.begin_shutdown();
    assert_eq!(
        request(&router, "GET", "/health", "", json!(null))
            .await
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        request(&router, "POST", "/api/games", "", json!({"name":"New"}))
            .await
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert!(
        tokio::time::timeout(std::time::Duration::from_secs(1), stream.frame())
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn startup_refuses_undecodable_saved_games() {
    let dir = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}", dir.path().join("games.db").display());
    let state = App::open(&url, false).await.unwrap();
    let (_, _, _) = create(&router(state.clone()), "Host").await;
    sqlx::query("UPDATE games SET state='{}'")
        .execute(&state.pool)
        .await
        .unwrap();
    state.pool.close().await;
    assert!(App::open(&url, false).await.is_err());
}

#[tokio::test]
async fn invite_status_is_public_but_resume_requires_the_original_member() {
    let (state, router) = app().await;
    let (id, host, original) = create(&router, "Host").await;
    let path = format!("/api/games/{id}");
    let invite = format!("{path}/invite");
    let response = request(&router, "GET", &invite, "", json!(null)).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert_eq!(body(response).await, json!({"joinable":true}));
    for (cookie, code) in [
        ("", "session_missing"),
        ("quiltfall_session=invalid", "session_invalid"),
    ] {
        let response = request(&router, "GET", &path, cookie, json!(null)).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(body(response).await["code"], code);
    }
    let (_, outsider, _) = create(&router, "Other").await;
    let response = request(&router, "GET", &path, &outsider, json!(null)).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert_eq!(body(response).await["code"], "not_a_member");
    assert_eq!(snapshot(&router, &id, &host).await, original);
    let invalid = request(
        &router,
        "POST",
        &format!("{path}/join"),
        "quiltfall_session=invalid",
        json!({"name":"Replacement"}),
    )
    .await;
    assert_eq!(invalid.status(), StatusCode::UNAUTHORIZED);
    assert!(!invalid.headers().contains_key("set-cookie"));
    assert_eq!(body(invalid).await["code"], "session_invalid");
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM players")
            .fetch_one(&state.pool)
            .await
            .unwrap(),
        2
    );
    join(&router, &id, "Guest").await;
    assert_eq!(
        body(request(&router, "GET", &invite, "", json!(null)).await).await,
        json!({"joinable":false})
    );
    let full = request(
        &router,
        "POST",
        &format!("{path}/join"),
        &outsider,
        json!({"name":"Other"}),
    )
    .await;
    assert_eq!(body(full).await["code"], "game_full");
    for suffix in ["", "/events", "/invite"] {
        let missing = request(
            &router,
            "GET",
            &format!("/api/games/missing{suffix}"),
            "",
            json!(null),
        )
        .await;
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
        assert_eq!(body(missing).await["code"], "game_not_found");
    }
}
async fn request(
    router: &Router,
    method: &str,
    path: &str,
    cookie: &str,
    payload: Value,
) -> Response {
    router
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("content-type", "application/json")
                .header("cookie", cookie)
                .body(if method == "GET" {
                    Body::empty()
                } else {
                    Body::from(payload.to_string())
                })
                .unwrap(),
        )
        .await
        .unwrap()
}
async fn body(response: Response) -> Value {
    serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}
async fn create(router: &Router, name: &str) -> (String, String, Value) {
    let response = request(router, "POST", "/api/games", "", json!({"name":name})).await;
    assert_eq!(response.status(), StatusCode::CREATED);
    let cookie = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned();
    let data = body(response).await;
    (
        data["game"]["id"].as_str().unwrap().to_owned(),
        cookie,
        data,
    )
}
async fn join(router: &Router, id: &str, name: &str) -> String {
    let response = request(
        router,
        "POST",
        &format!("/api/games/{id}/join"),
        "",
        json!({"name":name}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned()
}
async fn snapshot(router: &Router, id: &str, cookie: &str) -> Value {
    let response = request(
        router,
        "GET",
        &format!("/api/games/{id}"),
        cookie,
        json!(null),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    body(response).await
}

#[tokio::test]
async fn create_and_join_remember_two_distinct_players() {
    let (_, router) = app().await;
    let (id, host, data) = create(&router, "Ryan").await;
    assert_eq!(data["game"]["players"].as_array().unwrap().len(), 1);
    let guest = join(&router, &id, "GF").await;
    assert_ne!(host, guest);
    let a = snapshot(&router, &id, &host).await;
    let b = snapshot(&router, &id, &guest).await;
    assert_eq!(a["game"], b["game"]);
    assert_eq!(a["you"], 0);
    assert_eq!(b["you"], 1);
    let again = request(
        &router,
        "POST",
        &format!("/api/games/{id}/join"),
        &guest,
        json!({"name":"GF"}),
    )
    .await;
    assert_eq!(again.status(), StatusCode::OK);
}

#[tokio::test]
async fn opening_invite_does_not_claim_a_seat() {
    let (_, router) = app().await;
    let (id, host, _) = create(&router, "Ryan").await;
    assert_eq!(
        request(&router, "GET", &format!("/api/games/{id}"), "", json!(null))
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        snapshot(&router, &id, &host).await["game"]["players"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn concurrent_joins_claim_only_one_second_seat() {
    let (_, router) = app().await;
    let (id, _, _) = create(&router, "Ryan").await;
    let url = format!("/api/games/{id}/join");
    let (a, b) = tokio::join!(
        request(&router, "POST", &url, "", json!({"name":"A"})),
        request(&router, "POST", &url, "", json!({"name":"B"}))
    );
    let mut codes = [a.status().as_u16(), b.status().as_u16()];
    codes.sort();
    assert_eq!(codes, [200, 409]);
}

#[tokio::test]
async fn games_reject_nonmembers_and_wrong_turns() {
    let (_, router) = app().await;
    let (id, host, _) = create(&router, "Ryan").await;
    let guest = join(&router, &id, "GF").await;
    let (_, outsider, _) = create(&router, "Other").await;
    assert_eq!(
        request(
            &router,
            "GET",
            &format!("/api/games/{id}"),
            &outsider,
            json!(null)
        )
        .await
        .status(),
        StatusCode::FORBIDDEN
    );
    let snap = snapshot(&router, &id, &host).await;
    let wrong = if snap["game"]["state"]["turn"] == 0 {
        &guest
    } else {
        &host
    };
    let response = request(
        &router,
        "POST",
        &format!("/api/games/{id}/actions"),
        wrong,
        json!({"revision":1,"action":{"type":"place","kind":"kitten","x":0,"y":0}}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn simultaneous_duplicate_moves_commit_once_and_return_current_state() {
    let (_, router) = app().await;
    let (id, host, _) = create(&router, "Ryan").await;
    let guest = join(&router, &id, "GF").await;
    let snap = snapshot(&router, &id, &host).await;
    let active = if snap["game"]["state"]["turn"] == 0 {
        &host
    } else {
        &guest
    };
    let payload = json!({"revision":1,"action":{"type":"place","kind":"kitten","x":2,"y":2}});
    let url = format!("/api/games/{id}/actions");
    let (a, b) = tokio::join!(
        request(&router, "POST", &url, active, payload.clone()),
        request(&router, "POST", &url, active, payload)
    );
    let mut statuses = [a.status().as_u16(), b.status().as_u16()];
    statuses.sort();
    assert_eq!(statuses, [200, 409]);
    let snap = snapshot(&router, &id, active).await;
    assert_eq!(snap["game"]["revision"], 2);
    assert_eq!(snap["game"]["state"]["move_count"], 1);
    assert_eq!(
        snap["game"]["state"]["pieces"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|p| !p["pos"].is_null())
            .count(),
        1
    );
}

#[tokio::test]
async fn results_are_counted_once_and_visible_only_to_their_players() {
    let (_, router) = app().await;
    let (id, host, _) = create(&router, "Ryan").await;
    let guest = join(&router, &id, "GF").await;
    let payload = json!({"revision":1,"action":{"type":"resign"}});
    assert_eq!(
        request(
            &router,
            "POST",
            &format!("/api/games/{id}/actions"),
            &guest,
            payload.clone()
        )
        .await
        .status(),
        StatusCode::OK
    );
    assert_eq!(
        request(
            &router,
            "POST",
            &format!("/api/games/{id}/actions"),
            &guest,
            payload
        )
        .await
        .status(),
        StatusCode::CONFLICT
    );
    let me = body(request(&router, "GET", "/api/me", &host, json!(null)).await).await;
    assert_eq!(me["stats"], json!({"played":1,"wins":1,"losses":0}));
    assert_eq!(me["history"].as_array().unwrap().len(), 1);
    let me = body(request(&router, "GET", "/api/me", &guest, json!(null)).await).await;
    assert_eq!(me["stats"], json!({"played":1,"wins":0,"losses":1}));
    let (_, other, _) = create(&router, "Ryan").await;
    let me = body(request(&router, "GET", "/api/me", &other, json!(null)).await).await;
    assert_eq!(me["stats"]["played"], 0);
}

#[tokio::test]
async fn waiting_games_cannot_be_played_and_invalid_names_are_rejected() {
    let (_, router) = app().await;
    for name in ["   ".to_owned(), "a".repeat(33)] {
        assert_eq!(
            request(&router, "POST", "/api/games", "", json!({"name":name}))
                .await
                .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
    let (id, host, _) = create(&router, "Ryan").await;
    assert_eq!(
        request(
            &router,
            "POST",
            &format!("/api/games/{id}/actions"),
            &host,
            json!({"revision":0,"action":{"type":"place","kind":"kitten","x":0,"y":0}})
        )
        .await
        .status(),
        StatusCode::CONFLICT
    );
}

#[tokio::test]
async fn session_cookie_can_be_secure_and_identity_is_reused() {
    let state = App::open("sqlite::memory:", true).await.unwrap();
    let router = router(state);
    let response = request(&router, "POST", "/api/games", "", json!({"name":"Ryan"})).await;
    let header = response.headers()["set-cookie"]
        .to_str()
        .unwrap()
        .to_owned();
    assert!(header.contains("HttpOnly"));
    assert!(header.contains("SameSite=Lax"));
    assert!(header.contains("Secure"));
    let cookie = header.split(';').next().unwrap();
    let first = body(response).await;
    let second = body(
        request(
            &router,
            "POST",
            "/api/games",
            cookie,
            json!({"name":"Ryan"}),
        )
        .await,
    )
    .await;
    assert_eq!(
        first["game"]["players"][0]["id"],
        second["game"]["players"][0]["id"]
    );
}

#[tokio::test]
async fn pending_graduation_and_sessions_survive_server_restart() {
    let temp = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}", temp.path().join("quiltfall.db").display());
    let state = App::open(&url, false).await.unwrap();
    let r = router(state.clone());
    let (id, host, _) = create(&r, "Ryan").await;
    let guest = join(&r, &id, "GF").await;
    let mut saved = GameState::new(0);
    for (i, p) in saved.pieces.iter_mut().take(4).enumerate() {
        p.pos = Some(Pos { x: i as i8, y: 0 });
        p.kind = Kind::Kitten;
    }
    saved.phase = Phase::Graduation {
        options: vec![vec![0, 1, 2], vec![1, 2, 3]],
    };
    // Arrange a real persisted game, without adding a test-only production API.
    sqlx::query("UPDATE games SET state=? WHERE id=?")
        .bind(serde_json::to_string(&saved).unwrap())
        .bind(&id)
        .execute(&state.pool)
        .await
        .unwrap();
    state.pool.close().await;
    drop(r);
    drop(state);
    let state = App::open(&url, false).await.unwrap();
    let r = router(state);
    assert_eq!(
        snapshot(&r, &id, &guest).await["game"]["state"]["phase"]["type"],
        "graduation"
    );
    let response = request(
        &r,
        "POST",
        &format!("/api/games/{id}/actions"),
        &host,
        json!({"revision":1,"action":{"type":"graduate","pieces":[0,1,2]}}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body(response).await["game"]["state"]["turn"], 1);
}

#[tokio::test]
async fn event_stream_sends_initial_state_and_committed_moves() {
    let (_, router) = app().await;
    let (id, host, _) = create(&router, "Ryan").await;
    let guest = join(&router, &id, "GF").await;
    let response = request(
        &router,
        "GET",
        &format!("/api/games/{id}/events"),
        &guest,
        json!(null),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "text/event-stream");
    let mut stream = response.into_body();
    let frame = tokio::time::timeout(std::time::Duration::from_secs(2), stream.frame())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let initial = String::from_utf8(frame.into_data().unwrap().to_vec()).unwrap();
    assert!(initial.contains("event: snapshot"));
    assert!(initial.contains("\"revision\":1"));
    let snap = snapshot(&router, &id, &host).await;
    let active = if snap["game"]["state"]["turn"] == 0 {
        &host
    } else {
        &guest
    };
    assert_eq!(
        request(
            &router,
            "POST",
            &format!("/api/games/{id}/actions"),
            active,
            json!({"revision":1,"action":{"type":"place","kind":"kitten","x":2,"y":2}})
        )
        .await
        .status(),
        StatusCode::OK
    );
    let frame = tokio::time::timeout(std::time::Duration::from_secs(2), stream.frame())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let update = String::from_utf8(frame.into_data().unwrap().to_vec()).unwrap();
    assert!(update.contains("\"revision\":2"));
    assert!(update.contains("\"from\":null"));
    let unauthorized = request(
        &router,
        "GET",
        &format!("/api/games/{id}/events"),
        "",
        json!(null),
    )
    .await;
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
}

async fn finished_pair(router: &Router) -> (String, String, String, Value) {
    let (id, host, _) = create(router, "Roo").await;
    let guest = join(router, &id, "Bean").await;
    let response = request(
        router,
        "POST",
        &format!("/api/games/{id}/actions"),
        &guest,
        json!({"revision":1,"action":{"type":"resign"}}),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    (id, host, guest, body(response).await)
}

async fn rematch(router: &Router, id: &str, cookie: &str, revision: i64, action: &str) -> Response {
    request(
        router,
        "POST",
        &format!("/api/games/{id}/rematch"),
        cookie,
        json!({"revision":revision,"action":action}),
    )
    .await
}

#[tokio::test]
async fn rematch_accepts_same_players_once_without_changing_the_old_result() {
    for sender in [0, 1] {
        let (app, router) = app().await;
        let (id, host, guest, finished) = finished_pair(&router).await;
        let cookies = [&host, &guest];
        let offered = rematch(&router, &id, cookies[sender], 2, "request").await;
        assert_eq!(offered.status(), StatusCode::OK);
        let offered = body(offered).await;
        assert_eq!(offered["game"]["rematch"]["requested_by"], sender);
        assert_eq!(offered["game"]["revision"], 3);
        let accepted = rematch(&router, &id, cookies[1 - sender], 3, "accept").await;
        assert_eq!(accepted.status(), StatusCode::OK);
        let accepted = body(accepted).await;
        let next_id = accepted["game"]["rematch"]["game_id"].as_str().unwrap();
        assert_ne!(next_id, id);
        assert!(accepted["game"]["rematch"]["requested_by"].is_null());
        assert_eq!(accepted["game"]["state"], finished["game"]["state"]);
        assert_eq!(accepted["game"]["ended_at"], finished["game"]["ended_at"]);
        for (you, cookie) in cookies.iter().enumerate() {
            let next = snapshot(&router, next_id, cookie).await;
            assert_eq!(next["you"], you);
            assert_eq!(next["game"]["players"], finished["game"]["players"]);
            assert_eq!(next["game"]["state"]["phase"]["type"], "placement");
            assert_eq!(next["game"]["state"]["move_count"], 0);
            assert!(next["game"]["state"]["turn"].as_u64().unwrap() < 2);
            assert!(
                next["game"]["state"]["pieces"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|p| p["pos"].is_null() && p["kind"] == "kitten")
            );
            let profile = body(request(&router, "GET", "/api/me", cookie, json!(null)).await).await;
            assert_eq!(profile["stats"]["played"], 1);
            assert_eq!(profile["stats"]["wins"], if you == 0 { 1 } else { 0 });
            assert_eq!(profile["active"].as_array().unwrap().len(), 1);
            assert_eq!(profile["history"].as_array().unwrap().len(), 1);
        }
        for action in ["request", "accept"] {
            let duplicate = rematch(&router, &id, cookies[1 - sender], 3, action).await;
            assert_eq!(duplicate.status(), StatusCode::OK);
            assert_eq!(body(duplicate).await["game"]["rematch"]["game_id"], next_id);
        }
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM games")
            .fetch_one(&app.pool)
            .await
            .unwrap();
        assert_eq!(total, 2);
        // The next quilt can itself offer another round.
        let next = snapshot(&router, next_id, &guest).await;
        let response = request(
            &router,
            "POST",
            &format!("/api/games/{next_id}/actions"),
            &guest,
            json!({"revision":next["game"]["revision"],"action":{"type":"resign"}}),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            rematch(&router, next_id, &host, 1, "request")
                .await
                .status(),
            StatusCode::OK
        );
    }
}

#[tokio::test]
async fn rematch_checks_members_finished_state_roles_and_stale_offers() {
    let (_, router) = app().await;
    let (id, host, _) = create(&router, "Roo").await;
    let guest = join(&router, &id, "Bean").await;
    let (_, outsider, _) = create(&router, "Other").await;
    assert_eq!(
        rematch(&router, &id, "", 1, "request").await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        rematch(&router, &id, &outsider, 1, "request")
            .await
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        rematch(&router, &id, &host, 1, "request").await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    request(
        &router,
        "POST",
        &format!("/api/games/{id}/actions"),
        &guest,
        json!({"revision":1,"action":{"type":"resign"}}),
    )
    .await;
    assert_eq!(
        rematch(&router, &id, &guest, 2, "accept").await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        rematch(&router, &id, &host, 2, "request").await.status(),
        StatusCode::OK
    );
    assert_eq!(
        rematch(&router, &id, &host, 2, "request").await.status(),
        StatusCode::OK
    );
    assert_eq!(
        rematch(&router, &id, &host, 3, "accept").await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        rematch(&router, &id, &host, 3, "decline").await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(
        rematch(&router, &id, &guest, 3, "cancel").await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let stale = rematch(&router, &id, &guest, 2, "accept").await;
    assert_eq!(stale.status(), StatusCode::CONFLICT);
    assert_eq!(body(stale).await["current"]["game"]["revision"], 3);
    let cancelled = body(rematch(&router, &id, &host, 3, "cancel").await).await;
    assert!(cancelled["game"]["rematch"]["requested_by"].is_null());
    assert_eq!(
        rematch(&router, &id, &guest, 3, "accept").await.status(),
        StatusCode::CONFLICT
    );
    assert_eq!(
        rematch(&router, &id, &guest, 4, "request").await.status(),
        StatusCode::OK
    );
    let declined = body(rematch(&router, &id, &host, 5, "decline").await).await;
    assert!(declined["game"]["rematch"]["requested_by"].is_null());
    assert_eq!(
        rematch(&router, &id, &host, 6, "request").await.status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn simultaneous_rematches_leave_one_offer_and_acceptance_creates_one_game() {
    let (app, router) = app().await;
    let (id, host, guest, _) = finished_pair(&router).await;
    let (a, b) = tokio::join!(
        rematch(&router, &id, &host, 2, "request"),
        rematch(&router, &id, &guest, 2, "request")
    );
    assert!([a.status(), b.status()].contains(&StatusCode::OK));
    assert!([a.status(), b.status()].contains(&StatusCode::CONFLICT));
    let pending = snapshot(&router, &id, &host).await;
    let recipient = if pending["game"]["rematch"]["requested_by"] == 0 {
        &guest
    } else {
        &host
    };
    let (a, b) = tokio::join!(
        rematch(&router, &id, recipient, 3, "accept"),
        rematch(&router, &id, recipient, 3, "accept")
    );
    assert_eq!(a.status(), StatusCode::OK);
    assert_eq!(b.status(), StatusCode::OK);
    assert_eq!(
        body(a).await["game"]["rematch"]["game_id"],
        body(b).await["game"]["rematch"]["game_id"]
    );
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM games")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(total, 2);
}

#[tokio::test]
async fn rematch_persists_pending_and_accepted_links_across_restart() {
    let dir = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}", dir.path().join("games.db").display());
    let state = App::open(&url, false).await.unwrap();
    let r = router(state.clone());
    let (id, host, guest, _) = finished_pair(&r).await;
    assert_eq!(
        rematch(&r, &id, &host, 2, "request").await.status(),
        StatusCode::OK
    );
    state.pool.close().await;
    drop(r);
    let state = App::open(&url, false).await.unwrap();
    let r = router(state.clone());
    assert_eq!(
        snapshot(&r, &id, &guest).await["game"]["rematch"]["requested_by"],
        0
    );
    let accepted = body(rematch(&r, &id, &guest, 3, "accept").await).await;
    state.pool.close().await;
    drop(r);
    let r = router(App::open(&url, false).await.unwrap());
    let restored = snapshot(&r, &id, &host).await;
    assert_eq!(restored["game"]["rematch"], accepted["game"]["rematch"]);
    let next_id = restored["game"]["rematch"]["game_id"].as_str().unwrap();
    assert_eq!(snapshot(&r, next_id, &guest).await["you"], 1);
}

#[tokio::test]
async fn rematch_stream_broadcasts_pending_and_accepted_snapshots() {
    let (_, router) = app().await;
    let (id, host, guest, _) = finished_pair(&router).await;
    let response = request(
        &router,
        "GET",
        &format!("/api/games/{id}/events"),
        &guest,
        json!(null),
    )
    .await;
    let mut stream = response.into_body();
    stream.frame().await.unwrap().unwrap();
    rematch(&router, &id, &host, 2, "request").await;
    let frame = tokio::time::timeout(std::time::Duration::from_secs(2), stream.frame())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let update = String::from_utf8(frame.into_data().unwrap().to_vec()).unwrap();
    assert!(update.contains("\"requested_by\":0"));
    assert!(update.contains("\"revision\":3"));
    let accepted = body(rematch(&router, &id, &guest, 3, "accept").await).await;
    let frame = tokio::time::timeout(std::time::Duration::from_secs(2), stream.frame())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let update = String::from_utf8(frame.into_data().unwrap().to_vec()).unwrap();
    assert!(update.contains(accepted["game"]["rematch"]["game_id"].as_str().unwrap()));
    assert!(update.contains("\"revision\":4"));
}

#[tokio::test]
async fn draining_allows_an_already_admitted_mutation_to_commit() {
    let (state, router) = app().await;
    let (admitted, reached) = tokio::sync::oneshot::channel();
    let (release, waiting) = tokio::sync::oneshot::channel();
    let stream = async_stream::stream! {
        admitted.send(()).unwrap();
        waiting.await.unwrap();
        yield Ok::<_, std::convert::Infallible>(axum::body::Bytes::from_static(b"{\"name\":\"Admitted\"}"));
    };
    let request = Request::builder()
        .method("POST")
        .uri("/api/games")
        .header("content-type", "application/json")
        .body(Body::from_stream(stream))
        .unwrap();
    let response = tokio::spawn(router.oneshot(request));
    reached.await.unwrap();
    state.begin_shutdown();
    release.send(()).unwrap();
    assert_eq!(
        response.await.unwrap().unwrap().status(),
        StatusCode::CREATED
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM games")
            .fetch_one(&state.pool)
            .await
            .unwrap(),
        1
    );
}

#[tokio::test]
async fn public_origin_rejects_non_origins_and_ignores_host_headers() {
    for origin in [
        "ftp://example.com",
        "https://name:pass@example.com",
        "https://example.com/path",
        "https://example.com?x=1",
        "https://example.com/#fragment",
        "https://example.com:99999",
    ] {
        assert!(
            App::open("sqlite::memory:", false)
                .await
                .unwrap()
                .with_public_origin(origin)
                .is_err(),
            "{origin}"
        );
    }
    let app = App::open("sqlite::memory:", false)
        .await
        .unwrap()
        .with_public_origin("https://quiltfall.example/")
        .unwrap();
    let response = router(app)
        .oneshot(
            Request::builder()
                .uri("/invite/a%22b?secret=yes")
                .header("host", "attacker.example")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let html = String::from_utf8(
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap();
    assert!(html.contains("https://quiltfall.example/link-preview-v1.png"));
    assert!(!html.contains("attacker.example"));
    assert!(!html.contains("secret=yes"));
}

#[tokio::test]
async fn previous_saved_state_formats_remain_readable_and_playable() {
    let fixtures: Value =
        serde_json::from_str(include_str!("fixtures/game-states-v1.json")).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let url = format!("sqlite://{}", dir.path().join("games.db").display());
    let state = App::open(&url, false).await.unwrap();
    let routes = router(state.clone());
    let mut saves = vec![];
    for (phase, saved) in fixtures.as_object().unwrap() {
        let (id, host, _) = create(&routes, "Original host").await;
        join(&routes, &id, "Original guest").await;
        sqlx::query("UPDATE games SET state=? WHERE id=?")
            .bind(saved.to_string())
            .bind(&id)
            .execute(&state.pool)
            .await
            .unwrap();
        saves.push((id, host, phase.clone(), saved.clone()));
    }
    state.pool.close().await;
    let reopened = App::open(&url, false).await.unwrap();
    let routes = router(reopened);
    for (id, cookie, phase, saved) in saves {
        let snap = snapshot(&routes, &id, &cookie).await;
        assert_eq!(snap["game"]["state"], saved);
        if phase == "graduation" {
            let response = request(&routes, "POST", &format!("/api/games/{id}/actions"), &cookie, json!({"revision":snap["game"]["revision"], "action":{"type":"graduate","pieces":[0,1,2]}})).await;
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(
                body(response).await["game"]["state"]["phase"]["type"],
                "placement"
            );
        }
    }
}

#[tokio::test]
async fn existing_database_mode_never_creates_a_replacement() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("missing.db");
    let url = format!("sqlite://{}", path.display());
    assert!(App::open_existing(&url, false).await.is_err());
    assert!(!path.exists());
}
