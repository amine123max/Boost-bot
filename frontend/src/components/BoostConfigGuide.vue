<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
import BoostIcon from "./BoostIcon.vue";
import ConfigViewer from "./ConfigViewer.vue";
import { boost, copyText, perform } from "@/composables/useBoost";
import { accountClient } from "@/lib/api/account-client";
import { boostConfigToml, boostKeyCommand } from "@/lib/boost-configuration";
const props = defineProps<{ apiKey?: string }>();
const emit = defineEmits<{ close: [] }>();
const client = ref("codex"),
  shell = ref<"powershell" | "bash">("powershell");
const model = ref("");
const models = ref<{ slug: string; displayName: string }[]>([]);
const endpoint = ref("");
onMounted(async () => {
  const raw = boost.settings?.serviceAddr || "localhost:48760";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    if (["0.0.0.0", "[::]"].includes(url.hostname)) url.hostname = "localhost";
    url.pathname =
      url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1";
    url.search = "";
    url.hash = "";
    endpoint.value = url.toString().replace(/\/$/, "");
  } catch {
    endpoint.value = "http://localhost:48760/v1";
  }
  await perform(async () => {
    models.value = (await accountClient.listManagedModels()).items.filter(
      (m) =>
        m.supportedInApi !== false &&
        !/(?:^|[-_/])(?:images?|embeddings?|tts|whisper|transcribe|audio|realtime)(?:[-_/]|$)/i.test(
          m.slug,
        ),
    );
    model.value = models.value[0]?.slug || "";
  });
});
const configuration = computed(() =>
  boostConfigToml(endpoint.value, model.value),
);
const command = computed(() =>
  boostKeyCommand(shell.value, props.apiKey || ""),
);
const python = computed(
  () =>
    `import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    base_url=${JSON.stringify(endpoint.value)},\n    api_key=os.environ["BOOST_API_KEY"],\n)\n\nresponse = client.responses.create(\n    model=${JSON.stringify(model.value || "填入模型 ID")},\n    input="Hello",\n)\nprint(response.output_text)`,
);
</script>
<template>
  <BoostDialog title="Boost 配置方法" wide @close="emit('close')">
    <div class="config-guide">
      <div v-spring-switch class="segmented">
        <button
          :class="{ selected: client === 'codex' }"
          @click="client = 'codex'"
        >
          Codex CLI</button
        ><button
          :class="{ selected: client === 'api' }"
          @click="client = 'api'"
        >
          OpenAI 兼容客户端
        </button>
      </div>
      <section class="guide-step">
        <div class="guide-step-heading">
          <span class="guide-number">1</span>
          <h3>准备平台密钥</h3>
        </div>
        <p>
          在「密钥」中新建密钥，选择模型与调用规则。使用 Boost
          平台密钥，不要填账号 Token 或上游提供商密钥。
        </p>
      </section>
      <section class="guide-step">
        <div class="guide-step-heading">
          <span class="guide-number">2</span>
          <h3>设置 BOOST_API_KEY</h3>
          <select v-model="shell" aria-label="终端类型">
            <option value="powershell">PowerShell</option>
            <option value="bash">macOS / Linux</option></select
          ><button
            class="icon-button"
            title="复制环境变量命令"
            aria-label="复制环境变量命令"
            @click="perform(() => copyText(command))"
          >
            <BoostIcon name="copy" :size="16" />
          </button>
        </div>
        <pre class="guide-code">{{ command }}</pre>
        <p>
          命令在当前终端生效；请从同一终端启动客户端。永久使用可在系统用户环境变量中设置
          BOOST_API_KEY。
        </p>
      </section>
      <section class="guide-step">
        <div class="guide-step-heading">
          <span class="guide-number">3</span>
          <h3>
            {{ client === "codex" ? "配置 config.toml" : "连接 Boost 网关" }}
          </h3>
        </div>
        <div class="guide-fields">
          <label class="form-field"
            >网关地址<input
              v-model="endpoint"
              aria-label="配置网关地址"
              type="url" /></label
          ><label class="form-field"
            >模型<select v-model="model" aria-label="配置模型">
              <option v-if="!models.length" value="">请先并入远端模型</option>
              <option v-for="m in models" :key="m.slug" :value="m.slug">
                {{ m.slug }}
              </option>
            </select></label
          >
        </div>
        <template v-if="client === 'codex'"
          ><div class="guide-file-heading">
            <code>~/.codex/config.toml</code
            ><button
              class="text-button"
              @click="perform(() => copyText(configuration))"
            >
              <BoostIcon name="copy" :size="15" />复制配置
            </button>
          </div>
          <ConfigViewer :content="configuration" />
          <p>
            Windows 路径为 %USERPROFILE%\.codex\config.toml；设置了 CODEX_HOME
            时以其为准。将示例合并到现有配置，provider 名称须保持一致。
          </p></template
        >
        <template v-else
          ><div class="guide-file-heading">
            <span>Python · OpenAI SDK</span
            ><button
              class="text-button"
              @click="perform(() => copyText(python))"
            >
              <BoostIcon name="copy" :size="15" />复制示例
            </button>
          </div>
          <pre class="guide-code">{{ python }}</pre>
          <p>
            客户端选择 OpenAI 兼容模式，Base URL 填写上方地址，API Key 使用
            BOOST_API_KEY 的值。
          </p></template
        >
      </section>
      <section class="guide-step">
        <div class="guide-step-heading">
          <span class="guide-number">4</span>
          <h3>启动并验证</h3>
        </div>
        <p>
          保存后从已设置环境变量的终端{{
            client === "codex" ? "运行 codex" : "启动客户端"
          }}，发送一次请求。在「日志」查看模型、来源、状态与错误信息。模型不存在时先并入模型，并启用对应连接及路由。
        </p>
      </section>
    </div>
    <DialogActions
      ><button class="primary" @click="emit('close')">
        完成
      </button></DialogActions
    >
  </BoostDialog>
</template>
