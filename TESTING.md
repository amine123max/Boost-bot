# Validation / 验证说明

Standalone test directories, dedicated test runners and their package commands
have been removed across the repository at the user's request. Rust unit tests
contained directly in product source files remain available. Product features
such as account testing and network diagnostics are unchanged.

## Build checks

Run from the repository root with Node.js 22.13+, pnpm 10.30.3 and Rust stable:

```sh
node scripts/check-repository.mjs
npm --prefix bot run build
pnpm -C frontend run build
pnpm -C frontend run build:desktop
cargo test --workspace --locked
cargo check --manifest-path backend/desktop/Cargo.toml --locked
```

The frontend commands perform TypeScript checks and static production builds.
Cargo runs the retained inline unit tests; deleted integration suites are no
longer part of these results. A successful build is not a substitute for runtime
acceptance. For service deployments, also validate the Compose overlay and run
`nginx -t` on the target host before reloading its configuration.

## Runtime acceptance

Use an isolated account and task-specific data in a running Boost instance:

- Verify login, roles, direct navigation and desktop/Web transports.
- Verify Bot creation, streaming chat, stop/cancellation, saved history, channel
  conversations and expandable processing details.
- Verify specialist sandbox previews and Bot group handoffs, including exact
  message/file delivery and explicit overload failures.
- Check light/dark transitions, keyboard access and narrow layouts.
- For gateway changes, cover streaming and JSON, tools/tool calls, Responses and
  Chat Completions. Use real authorized upstream credentials for production claims.

Keep temporary fixtures, databases, screenshots and subprocess TEMP/TMP/TMPDIR
under a task-specific project `tmp/` directory. Preserve required screenshots in
`docs/images/`, then clean only that task's temporary output after processes exit.
Report checks that passed, skipped or were blocked, and distinguish local mock
validation from real provider/channel acceptance.
