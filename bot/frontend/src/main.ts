import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";
import { applyPreferences } from './preferences';
import { springPage } from '../../../frontend/src/lib/surface-motion';

document.documentElement.lang = "zh-CN";
applyPreferences();
const app = createApp(App);
app.directive('spring-page', springPage);
app.config.errorHandler = () => {
  // Do not log user message contents or credentials on render errors.
  document.getElementById("boot-error")?.removeAttribute("hidden");
};
app.mount("#app");
