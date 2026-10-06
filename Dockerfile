FROM rust:1.95-slim-bookworm AS builder
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
COPY web ./web
RUN cargo build --locked --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libgcc-s1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/quiltfall /usr/local/bin/quiltfall
ENV BIND_ADDR=0.0.0.0:8080 DATABASE_URL=sqlite:///tmp/quiltfall.db COOKIE_SECURE=true
EXPOSE 8080
CMD ["quiltfall"]
