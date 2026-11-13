<script lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import BotAvatar from "./BotAvatar.vue";
import HelpTip from "./HelpTip.vue";
import Icon from "./Icon.vue";
import Markdown from "./Markdown.vue";
import ActivityTrace from "./ActivityTrace.vue";
import type { Bot, Group, Approval, FileItem } from "../types";
import type { Conversation } from "../conversation";
import { defineComponent, type PropType } from "vue";
import { downloadFile } from "../api";

export default defineComponent({
  components: { BotAvatar, HelpTip, Icon, Markdown, ActivityTrace },
  props: {
    chat: { type: Object as PropType<Conversation>, required: true },
    bot: Object as PropType<Bot>,
    group: Object as PropType<Group>,
    bots: { type: Array as PropType<Bot[]>, required: true },
    models: { type: Array as PropType<string[]>, required: true },
    configure: Boolean,
    infoOpen: Boolean,
  },
  emits: ["edit", "collaborate", "menu", "info"],
  setup(props) {
    const scroller = ref<HTMLElement>(),
      composer = ref<HTMLTextAreaElement>(),
      answers = ref<Record<string, string>>({}),
      nearBottom = ref(true);
    const members = computed(() =>
      props.bots.filter((b) => props.group?.members.includes(b.id)),
    );
    const botOf = (id?: string) =>
      props.bots.find((b) => b.id === id) || props.bot;
    const title = computed(
      () => props.group?.name || props.bot?.name || "智能体",
    );
    const time = (value?: number) =>
      value
        ? new Date(value).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
    async function scroll() {
      await nextTick();
      if (nearBottom.value && scroller.value)
        scroller.value.scrollTop = scroller.value.scrollHeight;
    }
    watch(
      () => [
        props.chat.messages.length,
        props.chat.messages.at(-1)?.id,
        props.chat.live?.text,
        props.chat.live?.steps?.length,
      ],
      scroll,
    );
    watch(
      () => props.group?.id || props.bot?.id,
      () => {
        nearBottom.value = true;
        void scroll();
        answers.value = {};
      },
    );
    onMounted(scroll);
    function mention(bot: Bot | null) {
      props.chat.draft += `${props.chat.draft && !props.chat.draft.endsWith(" ") ? " " : ""}@${bot ? bot.id : "所有人"} `;
      composer.value?.focus();
    }
    function keydown(event: KeyboardEvent) {
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        void props.chat.send();
      }
    }
    async function file(conversation: string, value: FileItem) {
      try {
        await downloadFile(conversation, value);
      } catch (e) {
        props.chat.error = (e as Error).message;
      }
    }
    async function answer(
      item: Approval,
      action: "approve" | "deny" | "answer",
    ) {
      await props.chat.answer(item, action, answers.value[item.id] || "");
    }
    return {
      scroller,
      composer,
      members,
      botOf,
      title,
      time,
      mention,
      keydown,
      file,
      answers,
      answer,
      nearBottom,
    };
  },
});
</script>
<template>
  <section class="chat conversation-view" aria-label="会话">
    <header class="chat-head">
      <button
        class="icon-button mobile-menu"
        aria-label="打开导航"
        @click="$emit('menu')"
      >
        <Icon name="menu" />
      </button>
      <button
        class="head-bot"
        :aria-pressed="infoOpen"
        @click="group ? $emit('edit') : $emit('info')"
      >
        <Icon v-if="group" name="team" :size="22" /><BotAvatar
          v-else
          :bot="bot"
          :working="chat.running"
          :size="22"
        /><span class="name">{{ title }}</span>
      </button>
      <span class="grow" />
      <button
        v-if="!group"
        class="icon-btn"
        aria-label="发起协作"
        title="发起协作"
        @click="$emit('collaborate')"
      >
        <Icon name="team" />
      </button>
      <button class="icon-btn" aria-label="智能体设置" @click="$emit('edit')">
        <Icon name="settings" />
      </button>
      <button
        v-if="!group"
        class="icon-btn"
        aria-label="信息面板"
        :aria-pressed="infoOpen"
        @click="$emit('info')"
      >
        <Icon name="panel" />
      </button>
    </header>
    <div v-if="group" class="member-strip">
      <button
        v-for="b in members"
        :key="b.id"
        class="member-chip"
        @click="mention(b)"
      >
        <BotAvatar :bot="b" :size="22" /><span>{{ b.name }}</span></button
      ><button class="member-chip" @click="mention(null)">@所有人</button
      ><HelpTip
        text="点击成员插入稳定 ID 点名。未点名时由上次回复的成员继续；成员可点名其他成员接力，每条用户消息最多自动接力 6 次。"
      />
    </div>
    <div v-if="chat.error" class="error-banner" role="alert">
      <Icon name="info" /><span>{{ chat.error }}</span
      ><button class="quiet-button" @click="chat.load()">重新连接</button>
    </div>
    <div
      ref="scroller"
      class="chat-scroll"
      @scroll="
        nearBottom =
          ($event.target as HTMLElement).scrollHeight -
            ($event.target as HTMLElement).scrollTop -
            ($event.target as HTMLElement).clientHeight <
          100
      "
    >
      <div v-if="chat.loading" class="empty-state" role="status">
        <span class="loading-ring" />正在加载会话
      </div>
      <div
        v-else-if="!chat.messages.length && !chat.live && !chat.error"
        class="chat-empty"
      >
        <span v-if="group" class="empty-group"
          ><BotAvatar
            v-for="b in members.slice(0, 4)"
            :bot="b"
            :size="64" /></span
        ><BotAvatar v-else :bot="bot" :size="90" />
        <h2>
          {{ group ? "让团队一起完成任务" : "与 " + title + " 开始工作" }}
        </h2>
        <div class="chips">
          <button
            class="chip"
            @click="
              chat.draft = group
                ? '@所有人 请先明确分工、交付内容和验收标准，再依次开展工作。'
                : '请介绍你可以帮助我的事情，以及开始工作需要的信息。'
            "
          >
            {{ group ? "讨论分工与交付" : "了解能力"
            }}<Icon name="arrow" :size="15" /></button
          ><button v-if="!group" class="chip" @click="$emit('collaborate')">
            邀请其他智能体<Icon name="team" :size="15" />
          </button>
        </div>
      </div>
      <div
        class="chat-col ready"
        role="log"
        aria-label="消息记录"
        aria-live="off"
      >
        <article
          v-for="m in chat.messages"
          :key="m.id"
          class="message"
          :class="{
            'is-user': m.role === 'user',
            'is-system': m.role === 'system',
          }"
        >
          <BotAvatar
            v-if="group && m.role === 'assistant'"
            :bot="botOf(m.botId)"
            :size="30"
          />
          <div class="message-body">
            <div class="message-meta">
              <strong v-if="group || m.role === 'system'">{{
                m.role === "user"
                  ? "你"
                  : m.role === "system"
                    ? "系统"
                    : botOf(m.botId)?.name || "智能体"
              }}</strong
              ><time>{{ time(m.createdAt) }}</time>
            </div>
            <ActivityTrace
              v-if="m.steps"
              :count="m.steps"
              :conversation-id="m.conversationId || chat.conversationId"
              :message-id="m.id"
            /><Markdown :text="m.content" />
            <button
              v-for="f in m.files"
              :key="f.path"
              class="file-button"
              :disabled="f.gone === true"
              @click="file(m.conversationId || chat.conversationId, f)"
            >
              <Icon name="file" />{{ f.name
              }}{{ f.gone === true ? "（文件已移除）" : "" }}
            </button>
          </div>
        </article>
        <template v-if="chat.live">
          <article v-if="chat.live.userText && !group" class="message is-user">
            <div class="message-body">
              <div class="message-meta"><strong>你</strong></div>
              <Markdown :text="chat.live.userText" />
            </div>
          </article>
          <article class="message is-live">
            <BotAvatar
              v-if="group"
              :bot="botOf(chat.live.botId)"
              :working="chat.running"
              :size="30"
            />
            <div class="message-body">
              <div class="message-meta">
                <strong>{{ botOf(chat.live.botId)?.name || "智能体" }}</strong
                ><span role="status">{{
                  chat.stopping
                    ? "正在停止"
                    : chat.running
                      ? "处理中"
                      : "连接已断开"
                }}</span>
              </div>
              <ActivityTrace
                v-if="chat.live.steps?.length"
                :steps="chat.live.steps"
                :running="chat.running"
                :title="chat.live.userText"
              />
              <Markdown
                v-for="(text, i) in chat.live.interim"
                :key="i"
                :text="text"
              />
              <Markdown v-if="chat.live.text" :text="chat.live.text" /><span
                v-else
                class="stream-placeholder"
                >{{ chat.stopping ? "正在结束当前处理…" : "等待回复…" }}</span
              >
              <button
                v-for="f in chat.live.files"
                :key="f.path"
                class="file-button"
                @click="
                  file(chat.live.conversationId || chat.conversationId, f)
                "
              >
                <Icon name="file" />{{ f.name }}
              </button>
            </div>
          </article>
        </template>
        <section
          v-for="item in chat.pending"
          :key="item.id"
          class="approval-card"
        >
          <h3>
            {{ item.kind === "question" ? "需要你的回答" : "需要你的授权" }}
          </h3>
          <Markdown
            :text="item.prompt || item.summary || item.title || item.detail"
          />
          <Markdown v-if="item.reason" :text="item.reason" />
          <div v-for="(question, index) in item.questions" :key="index">
            <Markdown :text="question.question" />
            <ol v-if="question.options?.length">
              <li v-for="option in question.options" :key="option.label">
                {{ option.label }}
              </li>
            </ol>
          </div>
          <template v-if="configure"
            ><template v-if="item.kind === 'question'"
              ><label
                >回答<textarea v-model="answers[item.id]" rows="2" /></label
              ><button
                class="primary-button"
                :disabled="!answers[item.id]?.trim()"
                @click="answer(item, 'answer')"
              >
                提交回答
              </button></template
            >
            <div v-else class="button-row">
              <button class="primary-button" @click="answer(item, 'approve')">
                允许</button
              ><button class="quiet-button" @click="answer(item, 'deny')">
                拒绝
              </button>
            </div></template
          >
          <p v-else>请联系管理员处理此请求。</p>
        </section>
      </div>
    </div>
    <form class="composer-dock" @submit.prevent="chat.send()">
      <div class="composer">
        <textarea
          ref="composer"
          v-model="chat.draft"
          :aria-label="group ? '群消息' : '消息'"
          :placeholder="
            group
              ? '描述任务，或点击成员发起协作…'
              : '向「' + title + '」发送消息，输入 / 查看可用命令'
          "
          rows="1"
          @keydown="keydown"
        />
        <div class="composer-bar">
          <button
            type="button"
            class="plus"
            aria-label="邀请智能体协作"
            @click="$emit('collaborate')"
          >
            <Icon name="plus" /></button
          ><button
            v-if="configure && bot"
            type="button"
            class="model-chip perm"
            @click="$emit('edit')"
          >
            {{
              bot.settings.permission === "readonly"
                ? "只读"
                : bot.settings.permission === "full"
                  ? "完全权限"
                  : "工作区可写"
            }}</button
          ><HelpTip
            text="Enter 发送，Shift + Enter 换行。模型与账户由 Boost 统一管理。"
          /><span class="grow" /><label v-if="!group" class="model-control"
            ><select
              :value="chat.model"
              aria-label="对话模型"
              :disabled="chat.running"
              @change="
                chat.changeModel(($event.target as HTMLSelectElement).value)
              "
            >
              <option value="">{{ bot?.defaultModel || "默认模型" }}</option>
              <option
                v-if="chat.model && !models.includes(chat.model)"
                :value="chat.model"
              >
                {{ chat.model }}
              </option>
              <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
            </select></label
          ><span v-else class="hint">成员默认模型</span>
          <button
            v-if="chat.running"
            type="button"
            class="stop-button"
            :disabled="chat.stopping"
            aria-label="停止生成"
            @click="chat.stop()"
          >
            <Icon name="stop" :size="16" />停止</button
          ><button
            v-else
            type="submit"
            class="send"
            aria-label="发送消息"
            :disabled="chat.loading || !chat.draft.trim()"
          >
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </form>
  </section>
</template>
