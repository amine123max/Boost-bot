import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

document.documentElement.lang = "zh-CN";
const app = createApp(App);
app.config.errorHandler = () => {
  // Do not log user message contents or credentials on render errors.
  document.getElementById("boot-error")?.removeAttribute("hidden");
};
app.mount("#app");
