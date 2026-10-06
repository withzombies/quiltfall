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

async fn app() -> (App, Router) {
    let state = App::open("sqlite::memory:", false).await.unwrap();
    let router = router(state.clone());
    (state, router)
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
