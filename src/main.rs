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
    let app = App::open(&url, secure).await?;
    let address = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".into());
    let listener = TcpListener::bind(&address).await?;
    tracing::info!(%address, "Quiltfall is ready — open http://localhost:3000 or your computer's LAN address");
    axum::serve(listener, router(app)).await?;
    Ok(())
}
