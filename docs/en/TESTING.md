# Validation guidance

Standalone test directories and dedicated runners have been removed. Build checks, the retained inline Rust unit tests and runtime acceptance are documented in the [repository validation guide](../../TESTING.md). Run `pnpm -C frontend run build:desktop`, `npm --prefix bot run build` and `cargo test --workspace --locked` from the repository root. Record actual runtime checks against an isolated authenticated instance; do not treat a build as proof of real model or channel connectivity.
