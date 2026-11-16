# 共享对话框与表面样式

[English](README.md) · [前端](../../README.zh-CN.md)

主应用和 Bot 共用 [surfaces.css](surfaces.css)。密度和对齐调整在此维护，避免普通对话框、Bot 宽编辑器和确认框分化。

| Token | 默认值 | 作用 |
| --- | --- | --- |
| `--boost-dialog-heading-height` | 42px | 对话框标题最小高度 |
| `--boost-dialog-heading-block` | 6px | 标题上下内边距 |
| `--boost-dialog-inset` | 16px | 标题、正文和页脚对齐 |
| `--boost-dialog-close-size` | 28px | 关闭控件区域 |
| `--boost-section-heading-height` | 42px | 独立设置横幅 |
| `--boost-shell-heading-height` | 60px | 品牌与页面标题行 |
| `--boost-shell-heading-surface` | 主题中性灰 | 标题表面 |

[SpringSurface](../components/SpringSurface.vue) 与 [surface-motion](../lib/surface-motion.ts) 统一菜单、对话框、页面和提示运动。只改变位移和透明度，不缩放容器；系统或 Bot 减少动态设置跳过动画。Tooltip 进入 180ms、退出 120ms，不用悬停定时关闭。

主应用使用 BoostDialog，Bot 使用 Modal。保存期间不可关闭时传 busy；真正的取消/关闭按钮使用 data-dialog-close，触发退出动画后再通知父级。步骤切换和内联确认不加此标记，动画不得重复提交保存/删除。

滚动条装饰隐藏时仍保留滚动能力。Bot [SettingsBanner](../../../bot/frontend/src/components/SettingsBanner.vue)独立于表单行，活动区跟随真实滚动，不因横幅重建表单、丢弃草稿或改变授权。
