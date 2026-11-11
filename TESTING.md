# Testing / 测试说明

Run from the repository root. Use task-specific temporary storage and isolated test databases. The application Web entry is **12580**; the regression server is separate.

## Frontend and structure

```bash
node scripts/check-repository.mjs
pnpm -C frontend run build
pnpm -C frontend run build:desktop
pnpm -C frontend run test:runtime
pnpm -C frontend run test:e2e
```

Playwright uses Edge and a dedicated Vite preview. `BOOST_TEST_PORT` overrides its default port 3200; `BOOST_TEST_OUTPUT_DIR` redirects screenshots and results. Browser fixtures do not claim real traffic, account balances or model performance.

## Backend and desktop

```bash
cargo test --workspace --locked
cargo check --manifest-path backend/desktop/Cargo.toml --locked
```

Some legacy Rust tests share process environment or SQLite state. To diagnose interference, run `cargo test --workspace --lib --locked -- --test-threads=1` and targeted package checks. If a running application locks an executable, record the exact blocked command; do not silently claim the full workspace passed.

## Bot

```bash
npm --prefix bot run build
node bot/scripts/smoke-host.mjs --browser
npm --prefix bot test -- test/boost-integration.test.ts test/e2e.test.ts test/tasks.unit.test.ts test/rules.unit.test.ts test/channel-accounts.e2e.test.ts
```

The host smoke supplies a local mock model, exercises identity restrictions and launches an isolated browser workspace. Live provider and computer-control tests may require credentials, network access or platform tools; use explicit fixtures where possible.

## Documentation screenshots

PowerShell example:

```powershell
$taskTmp = Join-Path (Get-Location) 'tmp/readme-captures'
New-Item -ItemType Directory -Path $taskTmp -Force | Out-Null
$env:TEMP = $taskTmp
$env:TMP = $taskTmp
$env:TMPDIR = $taskTmp
$env:BOOST_TEST_OUTPUT_DIR = $taskTmp
$env:BOOST_DOC_SCREENSHOTS = Join-Path (Get-Location) 'docs/images'
pnpm -C frontend exec playwright test tests/boost.spec.ts --grep 'documentation gallery'
$env:BOOST_BOT_CAPTURE_PATH = Join-Path $env:BOOST_DOC_SCREENSHOTS 'bot-workspace.png'
node bot/scripts/smoke-host.mjs --browser
```

`BOOST_DOC_SCREENSHOTS` explicitly enables the otherwise skipped capture case. `BOOST_BOT_CAPTURE_PATH` selects the final Bot image. Review the resulting images, preserve deliverables under `docs/images/`, then remove only the task's disposable output.

截图与普通浏览器测试均使用隔离演示数据。测试结果需区分通过、跳过和环境阻挡；发布工作流存在不等于已经完成所有系统上的安装验证。
