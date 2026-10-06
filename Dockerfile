FROM rust:1.95-slim-bookworm AS builder
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential musl-tools ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add x86_64-unknown-linux-musl
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
COPY web ./web
ENV CC_x86_64_unknown_linux_musl=musl-gcc
RUN --mount=type=cache,target=/app/target \
    --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --locked --release --target x86_64-unknown-linux-musl \
    && cp target/x86_64-unknown-linux-musl/release/quiltfall /usr/local/bin/quiltfall

FROM flyio/litefs:0.5.14@sha256:c2d9f4bac3046e06468f8482a544a0dc8141877bbc830e519161e3295ad781a3 AS litefs
FROM alpine:3.24@sha256:d56c381f961d307a21b3ca004cf1e3910f106644aefb1f43e654c8a56c4fd395
RUN apk add --no-cache fuse3 ca-certificates
COPY --from=builder /usr/local/bin/quiltfall /usr/local/bin/quiltfall
COPY --from=litefs /usr/local/bin/litefs /usr/local/bin/litefs
COPY deploy/litefs.yml /etc/litefs.yml
COPY --chmod=755 deploy/start-litefs deploy/start-app /usr/local/bin/
ENV BIND_ADDR=0.0.0.0:8080 DATABASE_URL=sqlite:///litefs/quiltfall.db COOKIE_SECURE=true
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/start-litefs"]
