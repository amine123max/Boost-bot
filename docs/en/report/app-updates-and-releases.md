# App Updates and GitHub Releases

The public repository is `amine123max/Boost-bot`. Desktop clients read its GitHub Releases without a token. The release workflow embeds the actual `github.repository` through `BOOST_UPDATE_REPO`; an explicit runtime value can override it. The updater never falls back to another project's repository.

Automatic checking defaults to enabled through the existing persisted `app.update.auto_check` setting. The main desktop window checks after initialization and every 24 hours. Disabling the setting stops polling. Tray previews and Web/Docker clients do not run desktop update checks.

Checking only announces a new version. Downloading requires the user's **Download update** action; applying it requires a separate **Install update** or **Restart and update** action. Users can dismiss the prompt and return to Settings. The same version is automatically announced once per application run. Automatic check failures remain available in Settings without error notifications.

## Publish

1. Keep the version equal in root `Cargo.toml`, `backend/desktop/Cargo.toml`, `backend/desktop/tauri.conf.json`, and `frontend/package.json`.
2. Run `node scripts/check-release-version.mjs v0.5.0`, substituting the intended version.
3. Commit and push the source, then push the matching version tag. Alternatively, manually run `.github/workflows/release-all.yml` with an existing tag.
4. All desktop jobs must succeed before the workflow publishes the Release. Ordinary branch pushes do not announce updates.

The workflow produces Windows x64 NSIS installers, macOS Intel/Apple Silicon DMGs, and Linux x64 DEB/AppImage packages. It does not produce service archives or portable packages. macOS signing and notarization require publisher configuration.

Release tags must exceed the installed semantic version. Tags such as `v0.5.1-beta.1` become prereleases; clients use stable versions unless started with `BOOST_UPDATE_PRERELEASE=true`.

If the repository is later made private, clients require a runtime `BOOST_GITHUB_TOKEN` with repository contents read permission (`GITHUB_TOKEN` / `GH_TOKEN` also work). Private asset downloads use the authenticated asset API. Never embed tokens in installers.

Run frontend build, `build:desktop`, runtime tests, browser update tests and `cargo test --manifest-path backend/desktop/Cargo.toml --lib commands::updater` before release. After the first release, verify real GitHub checking, downloading and installation using an older installed client.

See the [Chinese guide](../../zh-CN/release/自动更新与GitHub发布.md) for commands.
