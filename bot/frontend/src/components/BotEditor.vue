<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { BotAppearance } from "../../../shared/appearance/preferences";
import type { BotEditorSettings } from "../bot-editor-options";
import {
  permissionOptions,
  protocolOptions,
  approvalOptions,
  computerOptions,
} from "../bot-editor-options";
import { preferences } from "../preferences";
import AppearancePicker from "./AppearancePicker.vue";
import SelectControl from "./SelectControl.vue";
import ModelSelect from "./ModelSelect.vue";
import HelpTip from "./HelpTip.vue";
import ModelSourceFields from "./ModelSourceFields.vue";
import SettingsBanner from "./SettingsBanner.vue";
const props = defineProps<{
  models: string[];
  configure: boolean;
  editing: boolean;
  busy: boolean;
  settings: BotEditorSettings;
  targetName?: string;
}>();
const emit = defineEmits<{
  "update:settings": [value: BotEditorSettings];
  valid: [value: boolean];
}>();
const name = defineModel<string>("name", { required: true }),
  prompt = defineModel<string>("prompt", { required: true }),
  model = defineModel<string>("model", { required: true }),
  appearance = defineModel<BotAppearance>("appearance", { required: true });
const root = ref<HTMLElement>(),
  current = ref("identity"),
  headerHeight = ref("42px"),
  navHeight = ref("0px");
const sourceModels = ref(props.models);
const sections = [
  { id: "identity", label: "基本信息" },
  { id: "appearance", label: "外观" },
  { id: "model", label: "模型与请求" },
  { id: "permissions", label: "权限与记忆" },
  { id: "background", label: "后台工作" },
  { id: "computer", label: "电脑操作" },
  { id: "collaboration", label: "智能体协作" },
];
const activeSection = computed(
  () => sections.find((section) => section.id === current.value) || sections[0],
);
const templates = [
  {
    name: "研究分析",
    prompt:
      "你是研究分析师。先明确问题、范围和证据要求，区分事实与推断，核对来源，输出可追溯的结论。需要其他成员协助时，明确交接任务和交付要求。",
  },
  {
    name: "开发工程",
    prompt:
      "你是软件工程师。先理解现有实现和约束，提出最小必要改动，完成实现与验证，报告结果与未解决的问题。协作时说明输入、输出与验收标准。",
  },
  {
    name: "内容策划",
    prompt:
      "你是内容策划师。根据目标读者与传播目的组织结构，校验事实，使用准确简练的表达。协作时将待核实的信息交给适合的成员。",
  },
];
function setting<K extends keyof BotEditorSettings>(
  key: K,
  value: BotEditorSettings[K],
) {
  emit("update:settings", { ...props.settings, [key]: value });
}
function jump(id: string) {
  current.value = id;
  const dialog = root.value?.closest("dialog"),
    section = root.value?.querySelector<HTMLElement>(
      `[data-editor-section="${id}"]`,
    );
  if (!dialog || !section) return;
  const header =
    dialog.querySelector(":scope > header")?.getBoundingClientRect().height ||
    0;
  const nav =
    innerWidth <= 600
      ? root.value?.querySelector(".editor-index")?.getBoundingClientRect()
          .height || 0
      : 0;
  dialog.scrollTo({
    top:
      dialog.scrollTop +
      section.getBoundingClientRect().top -
      dialog.getBoundingClientRect().top -
      header -
      nav -
      0,
    behavior:
      preferences.motion === "full" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "smooth"
        : "auto",
  });
}
let headerObserver: ResizeObserver | undefined,
  scrollDialog: HTMLDialogElement | null = null,
  frame = 0;
function syncSection() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!scrollDialog || !root.value) return;
    const header =
      scrollDialog.querySelector(":scope > header")?.getBoundingClientRect()
        .height || 0;
    const nav =
      innerWidth <= 600
        ? root.value.querySelector(".editor-index")?.getBoundingClientRect()
            .height || 0
        : 0;
    const line = scrollDialog.getBoundingClientRect().top + header + nav + 4;
    const sections = [
      ...root.value.querySelectorAll<HTMLElement>("[data-editor-section]"),
    ];
    let chosen = sections[0];
    for (const section of sections)
      if (section.getBoundingClientRect().top <= line) chosen = section;
    if (chosen) current.value = chosen.dataset.editorSection || "identity";
  });
}
onMounted(async () => {
  await nextTick();
  scrollDialog = root.value?.closest("dialog") || null;
  const header = scrollDialog?.querySelector(":scope > header");
  if (header) {
    headerHeight.value = header.getBoundingClientRect().height + "px";
    headerObserver = new ResizeObserver(() => {
      headerHeight.value = header.getBoundingClientRect().height + "px";
      navHeight.value =
        (innerWidth <= 600
          ? root.value?.querySelector(".editor-index")?.getBoundingClientRect()
              .height || 0
          : 0) + "px";
    });
    headerObserver.observe(header);
    const index = root.value?.querySelector(".editor-index");
    if (index) headerObserver.observe(index);
  }
  scrollDialog?.addEventListener("scroll", syncSection, { passive: true });
});
onBeforeUnmount(() => {
  headerObserver?.disconnect();
  scrollDialog?.removeEventListener("scroll", syncSection);
  cancelAnimationFrame(frame);
});
</script>
<template>
  <fieldset
    ref="root"
    class="bot-editor"
    :disabled="busy"
    :style="{
      '--editor-header-height': headerHeight,
      '--editor-nav-height': navHeight,
    }"
  >
    <nav class="editor-index" aria-label="智能体配置分区">
      <button
        v-for="section in sections.filter(
          (section) =>
            configure ||
            ['identity', 'appearance', 'model'].includes(section.id),
        )"
        :key="section.id"
        type="button"
        :aria-current="current === section.id ? 'location' : undefined"
        @click="jump(section.id)"
      >
        {{ section.label }}
      </button>
    </nav>
    <div class="editor-sections">
      <div class="editor-banner">
        <SettingsBanner
          :title="activeSection.label"
          :section-id="activeSection.id"
        />
      </div>
      <section
        data-editor-section="identity"
        aria-labelledby="editor-identity-title"
      >
        <h3 id="editor-identity-title">基本信息</h3>
        <p v-if="editing" class="editor-scope">
          仅修改「{{ targetName || "当前智能体" }}」的配置，其他智能体不受影响。
        </p>
        <div
          v-if="!editing"
          class="editor-presets"
          role="group"
          aria-label="快速创建模板"
        >
          <button
            v-for="template in templates"
            :key="template.name"
            type="button"
            @click="
              name = template.name;
              prompt = template.prompt;
            "
          >
            {{ template.name }}
          </button>
        </div>
        <label class="editor-field"
          ><span>名称</span
          ><input
            v-model="name"
            required
            maxlength="60"
            aria-label="智能体名称"
            placeholder="为智能体命名"
            autocomplete="off"
        /></label>
        <label class="editor-field"
          ><span
            >角色与职责<HelpTip
              text="描述专长、工作方式与交付要求。人设不会扩大工具权限。"
              label="角色与职责说明" /></span
          ><textarea
            v-model="prompt"
            rows="4"
            maxlength="32000"
            aria-label="角色与职责"
            placeholder="你希望这位智能体负责什么？"
          />
        </label>
      </section>
      <section
        data-editor-section="appearance"
        aria-labelledby="editor-appearance-title"
      >
        <h3 id="editor-appearance-title">外观</h3>
        <AppearancePicker v-model="appearance" />
      </section>
      <section data-editor-section="model" aria-labelledby="editor-model-title">
        <h3 id="editor-model-title">模型与请求</h3>
        <ModelSourceFields
          :source="settings.modelSource"
          :model-value="model"
          :models="models"
          :disabled="busy"
          @update:source="
            emit('update:settings', {
              ...settings,
              modelSource: $event,
              utilityModel: '',
            })
          "
          @update:model-value="model = $event"
          @models="sourceModels = $event"
          @valid="emit('valid', $event)"
        />
        <div class="editor-field editor-control-row">
          <span
            >请求格式<HelpTip
              text="纯对话及代理不可用时的回退请求可明确指定接口；代理工具模式继续使用模型原生适配器。"
              label="请求格式说明" /></span
          ><SelectControl
            :model-value="settings.modelProtocol"
            :options="protocolOptions"
            label="请求格式"
            @update:model-value="setting('modelProtocol', $event)"
          />
        </div>
        <div v-if="configure" class="editor-field editor-control-row">
          <span
            >后台辅助模型<HelpTip
              text="用于记忆整理、上下文管家及摘要；留空跟随对话模型。"
              label="后台辅助模型说明" /></span
          ><ModelSelect
            :model-value="settings.utilityModel"
            :models="sourceModels"
            label="后台辅助模型"
            default-label="跟随对话模型"
            @update:model-value="setting('utilityModel', $event)"
          />
        </div>
        <label class="editor-switch-row"
          ><span
            >流式模型响应<HelpTip
              text="关闭后使用上游JSON响应，工作台仍保留执行状态和错误反馈。"
              label="流式模型响应说明" /></span
          ><input
            type="checkbox"
            role="switch"
            :checked="settings.modelStreaming"
            aria-label="流式模型响应"
            @change="
              setting(
                'modelStreaming',
                ($event.target as HTMLInputElement).checked,
              )
            "
        /></label>
      </section>
      <section
        v-if="configure"
        data-editor-section="permissions"
        aria-labelledby="editor-permissions-title"
      >
        <h3 id="editor-permissions-title">权限与记忆</h3>
        <div class="editor-field editor-control-row">
          <span
            >执行权限<HelpTip
              text="只读不能修改文件；工作区写入对越界操作保持审批；完全权限允许以当前用户身份访问工作区外文件。"
              label="执行权限说明" /></span
          ><SelectControl
            :model-value="settings.permission"
            :options="permissionOptions"
            label="执行权限"
            @update:model-value="setting('permission', $event)"
          />
        </div>
        <p
          v-if="settings.permission === 'full'"
          class="editor-permission-warning"
        >
          完全权限允许访问工作区外文件，保存前需要确认。
        </p>
        <div class="editor-switches">
          <label class="editor-switch-row"
            ><span
              >长期记忆<HelpTip
                text="保存经授权的偏好与长期项目，不应记录密钥或密码。"
                label="长期记忆说明" /></span
            ><input
              type="checkbox"
              role="switch"
              aria-label="启用长期记忆"
              :checked="settings.memory"
              @change="
                setting('memory', ($event.target as HTMLInputElement).checked)
              "
          /></label>
          <label class="editor-switch-row"
            ><span
              >团队共享记忆<HelpTip
                text="共享信息会被其他智能体读取；关闭长期记忆时不会新增共享内容。"
                label="团队共享记忆说明" /></span
            ><input
              type="checkbox"
              role="switch"
              aria-label="允许写入团队共享记忆"
              :checked="settings.teamWrite"
              :disabled="!settings.memory"
              @change="
                setting(
                  'teamWrite',
                  ($event.target as HTMLInputElement).checked,
                )
              "
          /></label>
          <label class="editor-switch-row"
            ><span>自动整理记忆</span
            ><input
              type="checkbox"
              role="switch"
              aria-label="自动整理记忆"
              :checked="settings.review"
              :disabled="!settings.memory"
              @change="
                setting('review', ($event.target as HTMLInputElement).checked)
              "
          /></label>
          <label class="editor-switch-row"
            ><span
              >上下文管家<HelpTip
                text="按已有机制评估长会话分段与压缩。"
                label="上下文管家说明" /></span
            ><input
              type="checkbox"
              role="switch"
              aria-label="上下文管家"
              :checked="settings.steward"
              @change="
                setting('steward', ($event.target as HTMLInputElement).checked)
              "
          /></label>
        </div>
      </section>
      <section
        v-if="configure"
        data-editor-section="background"
        aria-labelledby="editor-background-title"
      >
        <h3 id="editor-background-title">后台工作</h3>
        <label class="editor-switch-row"
          ><span
            >暂停后台任务<HelpTip
              text="暂停新的后台工作与主动消息，直接对话仍可使用。"
              label="暂停后台任务说明" /></span
          ><input
            type="checkbox"
            role="switch"
            aria-label="暂停后台任务"
            :checked="settings.paused"
            @change="
              setting('paused', ($event.target as HTMLInputElement).checked)
            "
        /></label>
        <label class="editor-field editor-control-row"
          ><span
            >并行后台任务<HelpTip
              text="聊天不占后台名额，每个智能体允许1–8项并行后台任务。"
              label="并行后台任务说明" /></span
          ><input
            type="number"
            min="1"
            max="8"
            aria-label="并行后台任务"
            :value="settings.taskSlots"
            @input="
              setting(
                'taskSlots',
                Number(($event.target as HTMLInputElement).value),
              )
            "
        /></label>
        <label class="editor-switch-row"
          ><span
            >免打扰<HelpTip
              text="按主机时区延后后台通知，聊天回复照常。"
              label="免打扰说明" /></span
          ><input
            type="checkbox"
            role="switch"
            aria-label="免打扰"
            :checked="settings.quietHours.enabled"
            @change="
              setting('quietHours', {
                ...settings.quietHours,
                enabled: ($event.target as HTMLInputElement).checked,
              })
            "
        /></label>
        <div
          v-if="settings.quietHours.enabled"
          class="editor-field editor-control-row"
        >
          <span>免打扰时段</span>
          <div class="editor-time-range">
            <input
              type="time"
              aria-label="免打扰开始时间"
              :value="settings.quietHours.from"
              @input="
                setting('quietHours', {
                  ...settings.quietHours,
                  from: ($event.target as HTMLInputElement).value,
                })
              "
            /><span>—</span
            ><input
              type="time"
              aria-label="免打扰结束时间"
              :value="settings.quietHours.to"
              @input="
                setting('quietHours', {
                  ...settings.quietHours,
                  to: ($event.target as HTMLInputElement).value,
                })
              "
            />
          </div>
        </div>
        <label class="editor-switch-row"
          ><span
            >微信续期提醒<HelpTip
              text="微信会话窗口即将关闭且有待发消息时提醒续期。"
              label="微信续期提醒说明" /></span
          ><input
            type="checkbox"
            role="switch"
            aria-label="微信续期提醒"
            :checked="settings.nudge"
            @change="
              setting('nudge', ($event.target as HTMLInputElement).checked)
            "
        /></label>
      </section>
      <section
        v-if="configure"
        data-editor-section="computer"
        aria-labelledby="editor-computer-title"
      >
        <h3 id="editor-computer-title">电脑操作</h3>
        <label class="editor-switch-row"
          ><span
            >启用电脑操作<HelpTip
              text="允许读取界面及操作鼠标键盘，仍受当前执行权限约束。"
              label="启用电脑操作说明" /></span
          ><input
            type="checkbox"
            role="switch"
            aria-label="启用电脑操作"
            :checked="settings.computerUse.enabled"
            @change="
              setting('computerUse', {
                ...settings.computerUse,
                enabled: ($event.target as HTMLInputElement).checked,
              })
            "
        /></label>
        <div class="editor-field editor-control-row">
          <span>操作引擎</span
          ><SelectControl
            :model-value="settings.computerUse.backend"
            :options="computerOptions"
            label="操作引擎"
            :disabled="!settings.computerUse.enabled"
            @update:model-value="
              setting('computerUse', {
                ...settings.computerUse,
                backend: $event,
              })
            "
          />
        </div>
        <div class="editor-field editor-control-row">
          <span
            >输入操作审批<HelpTip
              text="可在点击和输入前询问，读取界面不需要额外批准。"
              label="输入操作审批说明" /></span
          ><SelectControl
            :model-value="settings.computerUse.approval"
            :options="approvalOptions"
            label="输入操作审批"
            :disabled="!settings.computerUse.enabled"
            @update:model-value="
              setting('computerUse', {
                ...settings.computerUse,
                approval: $event,
              })
            "
          />
        </div>
      </section>
      <section
        v-if="configure"
        data-editor-section="collaboration"
        aria-labelledby="editor-collaboration-title"
      >
        <h3 id="editor-collaboration-title">智能体协作</h3>
        <p class="editor-scope">
          仅创建工作台内部协作群，不会创建飞书或微信群。
        </p>
        <label class="editor-switch-row"
          ><span
            >允许自动建群<HelpTip
              text="不复制私聊、最多六次接力，只读模式不能建群。"
              label="允许自动建群说明" /></span
          ><input
            type="checkbox"
            role="switch"
            aria-label="允许自动建群"
            :checked="settings.collaboration"
            @change="
              setting(
                'collaboration',
                ($event.target as HTMLInputElement).checked,
              )
            "
        /></label>
      </section>
    </div>
  </fieldset>
</template>
<style scoped>
.bot-editor {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  min-width: 0;
  border: 0;
  padding: 0;
  margin: 0;
}
.editor-index {
  align-self: start;
  position: sticky;
  top: calc(var(--editor-header-height) - 1px);
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 10px;
  background: var(--surface);
}
.editor-index button {
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--muted);
  text-align: left;
}
.editor-index button:hover {
  background: var(--well);
  color: var(--fg);
}
.editor-index button[aria-current] {
  background: var(--pill);
  color: var(--fg);
  font-weight: 600;
}
.editor-index button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.editor-sections {
  display: block;
  padding: 0 16px 16px 12px;
}
.editor-banner {
  position: sticky;
  top: calc(var(--editor-header-height) + var(--editor-nav-height) - 1px);
  z-index: 6;
  height: 0;
  margin-inline: -12px -16px;
}
.editor-banner :deep(.settings-banner) {
  background: var(--surface);
}
.editor-banner :deep(.settings-banner-inner) {
  padding-inline: 12px 16px;
}
.editor-banner :deep(h2) {
  font-size: 13px;
}
.editor-sections section {
  scroll-margin-top: 75px;
  min-width: 0;
  margin-bottom: 12px;
}
.editor-sections section > h3 {
  display: flex;
  align-items: center;
  position: static;
  min-height: var(--boost-section-heading-height);
  box-sizing: border-box;
  padding: 10px 0;
  margin: 0 0 8px;
  background: var(--surface);
  border-bottom: 0;
  line-height: 1.4;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.editor-field {
  display: grid;
  min-width: 0;
  gap: 6px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--fg-2);
}
.editor-field > span,
.editor-switch-row > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.editor-field input,
.editor-field textarea {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--well);
  color: var(--fg);
  font: inherit;
  font-weight: 400;
  line-height: 1.5;
}
.editor-field input:hover,
.editor-field textarea:hover {
  border-color: var(--muted);
}
.editor-field input:focus-visible,
.editor-field textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.editor-field textarea {
  resize: vertical;
  min-height: 76px;
}
.editor-scope {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.editor-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.editor-presets button {
  padding: 7px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 11px;
  color: var(--fg-2);
}
.editor-presets button:hover {
  background: var(--well);
  border-color: var(--muted);
}
.editor-switches {
  margin-top: 10px;
  border: 0;
  padding: 0;
}
.editor-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  padding: 8px 0;
  font-size: 12px;
  color: var(--fg-2);
}
.editor-switch-row + .editor-switch-row {
  border-top: 1px solid var(--line);
}
.editor-permission-warning {
  color: var(--red);
  font-size: 12px;
  line-height: 1.5;
  margin: 12px 0 0;
}
.editor-field input:disabled,
.editor-field textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.editor-control-row {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 280px);
  align-items: center;
  gap: 10px;
}
.editor-time-range {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.editor-time-range input {
  min-width: 0;
}
@media (max-width: 600px) {
  .bot-editor {
    display: block;
  }
  .editor-index {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 4px 12px;
    gap: 2px;
    border-bottom: 1px solid var(--line);
  }
  .editor-index button {
    text-align: center;
    padding: 6px 0;
    font-size: 10px;
  }
  .editor-sections {
    padding: 0 16px 12px;
    gap: 12px;
  }
  .editor-sections section {
    scroll-margin-top: 130px;
  }
  .editor-banner {
    margin-inline: -16px;
  }
  .editor-banner :deep(.settings-banner-inner) {
    padding-inline: 16px;
  }
  .editor-control-row {
    grid-template-columns: minmax(85px, 1fr) minmax(0, 185px);
  }
}
</style>
