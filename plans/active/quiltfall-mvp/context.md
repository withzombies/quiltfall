# Context
- Workspace was empty, no existing repository or source files. Initialized Git.
- Rust 1.95, Cargo, Node/npm and flyctl are available.
- User chose live play with saves, invite links without accounts, local-first
  hosting, results/basic stats, immediate moves/no undo, cozy cats/quilt.
- First three implementation references were read in full during planning.
- Anonymous identity is tied to browser cookies and host; deleting cookies or
  moving to another address does not recover the old identity.
- Local computer must stay running and phones must reach it over the LAN.

## Resume here
Rules implemented after missing-engine RED; 15 tests pass, build/fmt/Clippy pass.
Implement the persistence/HTTP layer from failing integration tests.
Continue through the approved plan; update these docs at each slice boundary.

## Persistence/HTTP research
- https://docs.rs/axum/0.8.9/axum/response/sse/
- https://docs.rs/sqlx/0.8.6/sqlx/sqlite/struct.SqliteConnectOptions.html
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
Use one SQLite connection, automatic schema migrations, hashed session tokens,
HttpOnly/SameSite=Lax cookies (Secure when configured for HTTPS). Subscribe to
broadcasts before fetching the initial snapshot; refetch on channel lag.

## Branding
User requested a different name: Quiltfall. Update all product branding, cookie
names, database defaults and crate name. Web search found no obvious game/app name collision (some unrelated textile uses);
this is not a formal trademark clearance. Use original SVG illustrations and UI text.

Persistence GREEN: 10 integration tests pass, including competing joins, duplicate
actions, member authorization, cookie reuse, SQLite restart with pending graduation,
stats counted once, and SSE initial/committed snapshots. Fresh build/fmt/Clippy pass.
