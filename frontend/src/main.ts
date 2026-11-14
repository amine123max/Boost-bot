import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import "./styles.css";
import { installButtonEffects } from "./lib/button-effects";
import { springSwitch } from "./lib/spring-switch";
import { resizableColumns } from "./directives/resizable-columns";
import { springPage } from "./lib/surface-motion";
const removeButtonEffects = installButtonEffects();
if (import.meta.hot) import.meta.hot.dispose(removeButtonEffects);

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/close-confirm/", component: () => import("./components/MainWindowCloseDialog.vue") },
    { path: '/bot/:pathMatch(.*)*', component: () => import('./pages/BotPage.vue'), meta: { title: 'Boost 智能体' } },
    {
      path: "/tray-preview/:pathMatch(.*)*",
      component: () => import("./pages/TrayPage.vue"),
      meta: { title: "Boost" },
    },
    {
      path: "/home/",
      alias: "/",
      component: () => import("./pages/HomePage.vue"),
      meta: { title: "首页", subtitle: "你的 AI 服务，一目了然" },
    },
    {
      path: "/accounts/:pathMatch(.*)*",
      component: () => import("./pages/AccountsPage.vue"),
      meta: { title: "账号管理", subtitle: "管理 OpenAI 账号与订阅额度" },
    },
    {
      path: "/aggregate-api/:pathMatch(.*)*",
      component: () => import("./pages/ConnectionsPage.vue"),
      meta: { title: "聚合API", subtitle: "连接聚合 API 与上游服务" },
    },
    {
      path: "/apikeys/:pathMatch(.*)*",
      component: () => import("./pages/KeysPage.vue"),
      meta: { title: "密钥", subtitle: "平台密钥、模型与调用策略" },
    },
    {
      path: "/logs/:pathMatch(.*)*",
      component: () => import("./pages/LogsPage.vue"),
      meta: { title: "日志", subtitle: "追踪每一次请求" },
    },
    {
      path: "/tests/:pathMatch(.*)*",
      component: () => import("./pages/TestsPage.vue"),
      meta: { title: "测试中心", subtitle: "账号可用性与网络质量" },
    },
    {
      path: "/settings/:pathMatch(.*)*",
      component: () => import("./pages/SettingsPage.vue"),
      meta: { title: "设置", subtitle: "让 Boost 更适合你的工作方式" },
    },
    {
      path: "/models/:pathMatch(.*)*",
      component: () => import("./pages/ModelsPage.vue"),
      meta: { title: "模型" },
    },
    { path: "/:pathMatch(.*)*", redirect: "/home/" },
  ],
});
const app = createApp(App)
  .directive("spring-switch", springSwitch)
  .directive("resizable-columns", resizableColumns)
  .directive("spring-page", springPage)
  .use(router);
void router.isReady().then(() => app.mount("#app"));
