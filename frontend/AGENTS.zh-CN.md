# 前端与桌面工程规范

[English](AGENTS.md)

适用于 Vue 前端和构建配置。原生所有权与验证见 ../backend/AGENTS.md。

- 使用 Vue 3 Composition API、严格 TypeScript、Vue Router 和 Vite。UI 状态放聚焦 composable，业务调用使用 src/lib/api。
- 页面放 src/pages，共享组件放 src/components，全局 token 放 src/styles.css；通过 BoostIcon 和本地资源使用图标。
- 使用 Bahamas Bold 品牌、系统正文字体和中性 Zinc 深浅色。控件紧凑、标签简短，说明仅保留操作所需内容。
- 输出 frontend/out，保留每路由 index.html，支持 Tauri/Boost Web 直接导航及托盘预览。
- 保留 invoke/withAddr 桌面 IPC 和现有 Web RPC；新能力同步 Rust、Tauri、Web 映射和类型封装。
- 使用 BoostDialog 处理焦点、Escape、滚动和固定操作区，不嵌套按钮；错误、空状态和加载反映真实状态。
- 角色权限由服务端决定，全局指标、配置和路由只对管理员开放，不能削弱授权。
- 服务设置通过后端持久化，纯 UI 偏好声明默认值和版本化存储；配置/诊断脱敏。
- 不虚构账号、流量、IP、延迟或进程数据；验收 fixture 仅在任务 tmp。
- 执行前端 build、build:desktop 并运行验收。独立测试目录/Playwright 配置/专用命令已移除；Rust 运行相关或工作区保留内联测试。
- 临时文件位于任务 tmp；不自动备份，不在当前用户未明确要求时创建子代理。
