use quiltfall::server::{App, router};
use std::{env, fs, path::Path};
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    let url = match env::var("DATABASE_URL") {
        Ok(url) => url,
        Err(_) => {
            fs::create_dir_all(Path::new("data"))?;
            "sqlite://data/quiltfall.db".into()
        }
    };
    let secure = env::var("COOKIE_SECURE").is_ok_and(|value| value == "true");
    let app = if env::var("QUILTFALL_REQUIRE_EXISTING").is_ok_and(|value| value == "true") {
        App::open_existing(&url, secure).await?
    } else {
        App::open(&url, secure).await?
    }
    .with_public_origin(
        &env::var("PUBLIC_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into()),
    )?;
    let address = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".into());
    let listener = TcpListener::bind(&address).await?;
    tracing::info!(%address, "Quiltfall is ready — open http://localhost:3000 or your computer's LAN address");
    let state = app.clone();
    let (draining, mut drain) = tokio::sync::watch::channel(false);
    let serving = axum::serve(listener, router(app.clone())).with_graceful_shutdown(async move {
        shutdown_signal().await;
        state.begin_shutdown();
        draining.send_replace(true);
        tracing::info!("draining accepted requests before shutdown");
    });
    let serving = std::future::IntoFuture::into_future(serving);
    tokio::pin!(serving);
    tokio::select! {
        result = &mut serving => result?,
        _ = drain.changed() => {
            match tokio::time::timeout(std::time::Duration::from_secs(10), &mut serving).await {
                Ok(result) => result?,
                Err(_) => tracing::warn!("request drain deadline reached"),
            }
        }
    }
    app.pool.close().await;
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("install SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = terminate.recv() => {},
        }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c()
        .await
        .expect("install interrupt handler");
}
