# 自动更新与 GitHub 发布

项目仓库为 `amine123max/Boost-bot`。桌面版默认从此仓库的 GitHub Releases 检查版本；GitHub Actions 打包时还会通过 `BOOST_UPDATE_REPO=${{ github.repository }}` 将实际仓库名写入客户端。更新源在构建时确定，运行时环境变量和历史设置不再覆盖；更新弹窗显示实际仓库。更新器不会回退到其他项目仓库。

## 用户决定是否更新

- 自动检查默认开启，沿用服务中持久化的 `app.update.auto_check` 设置。
- 主窗口就绪后检查一次，此后每 24 小时检查一次；关闭设置即停止定时检查，托盘预览窗口不重复检查。
- 发现新版本时显示提示。检查不会下载、安装或重启应用；用户可点击“稍后”。同一版本在本次运行中只自动提醒一次。
- 用户点击“下载更新”后才下载；下载完成后再点击“安装更新”或“重启并更新”才应用。下载中可关闭提示，稍后在设置页继续。
- 设置页可手动检查，查看更新仓库、可用版本及错误。自动检查失败不会弹出错误通知。
- Web / Docker 模式不调用桌面更新命令，部署者自行更新服务。

## 首次发布

1. 将源码推送到 `https://github.com/amine123max/Boost-bot.git`。
2. 确认仓库启用了 GitHub Actions。`.github/workflows/release-all.yml` 支持推送 `v*` 标签或从 Actions 页面选择已有标签手动运行。
3. 保持以下四处版本一致：根 `Cargo.toml`、`backend/desktop/Cargo.toml`、`backend/desktop/tauri.conf.json` 和 `frontend/package.json`。
4. 推送匹配的标签。例如首个版本为 `0.5.0`：

   ```powershell
   node scripts/check-release-version.mjs v0.5.0
   git tag v0.5.0
   git push origin main
   git push origin v0.5.0
   ```

5. 工作流构建 Windows x64 安装器、macOS Intel / Apple Silicon DMG、Linux x64 DEB / AppImage，全部成功后才发布 Release。
6. 下次发布先递增四处版本，例如 `0.5.1`，再提交并推送 `v0.5.1` 标签。仅推送源码不会让旧客户端发现更新，必须有更高版本的已发布 Release。

标签版本不一致会让构建失败。带 `-beta.1` 等后缀的标签发布为预发布版，默认检查只接收稳定版；需要测试预发布更新时，在启动客户端前设置 `BOOST_UPDATE_PRERELEASE=true`。

当前工作流仅发布桌面安装包。便携版已有更新命令，但此工作流不生成便携分发包。macOS 分发需要自行配置签名/公证才能改善首次启动体验。

## 仓库可见性与令牌

`amine123max/Boost-bot` 使用公开仓库，用户无需令牌即可检查和下载更新。如果将来改为私有，客户端启动前需要在本机设置 `BOOST_GITHUB_TOKEN`（也支持 `GITHUB_TOKEN` / `GH_TOKEN`），令牌需要该仓库的内容读取权限。令牌只从运行环境读取，不能写入源码或嵌入安装包。

## 本地打包

```powershell
$env:BOOST_UPDATE_REPO = 'amine123max/Boost-bot'
Set-Location backend/desktop
cargo tauri build --bundles nsis
```

构建时的仓库地址会写入可执行文件；用户运行安装版无需额外设置仓库环境变量。发布后仍需用旧版本客户端验证真实 GitHub 检查、下载及安装链路。
