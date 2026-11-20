<script lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import BotAvatar from "./BotAvatar.vue";
import HelpTip from "./HelpTip.vue";
import Icon from "./Icon.vue";
import SettingsButton from './SettingsButton.vue';
import ComposerModelMenu from './ComposerModelMenu.vue';
import BotPermissionControl from './BotPermissionControl.vue';
import Markdown from "./Markdown.vue";
import TurnTranscript from "./TurnTranscript.vue";
import ComposerQuestion from "./ComposerQuestion.vue";
import QueuedMessages from "./QueuedMessages.vue";
import ChatTasks from "./ChatTasks.vue";
import TurnFileChanges from "./TurnFileChanges.vue";
import ConversationTimeline from "./ConversationTimeline.vue";
import MessageBubble from "./MessageBubble.vue";
import type { Bot, Group, FileItem, Task } from "../types";
import type { Conversation } from "../conversation";
import { defineComponent, type PropType } from "vue";
import { downloadFile } from "../api";

export default defineComponent({
  components: { BotAvatar, HelpTip, Icon, SettingsButton, ComposerModelMenu, BotPermissionControl, Markdown, TurnTranscript, ComposerQuestion, QueuedMessages, ChatTasks, MessageBubble, TurnFileChanges, ConversationTimeline },
  props: {
    chat: { type: Object as PropType<Conversation>, required: true },
    bot: Object as PropType<Bot>,
    group: Object as PropType<Group>,
    bots: { type: Array as PropType<Bot[]>, required: true },
    models: { type: Array as PropType<string[]>, required: true },
    configure: Boolean,
    infoOpen: Boolean,
    localSession: Boolean,
  },
  emits: ["edit", "collaborate", "menu", "info", "refresh"],
  setup(props, { emit }) {
    const scroller = ref<HTMLElement>(),
      composer = ref<HTMLTextAreaElement>(),
      nearBottom = ref(true);
    const taskDock = ref<InstanceType<typeof ChatTasks>>();
    const commandsDismissed = ref(false);
    const taskIntent = ref('');
    const question = computed(() => props.chat.pending.find(item => item.kind === 'question' && !item.taskId) ??
      (!props.chat.running ? props.chat.pending.find(item => item.kind === 'question') : undefined));
    const approvals = computed(() => props.chat.pending.filter(item => item.kind !== 'question' && (!item.taskId || !props.chat.running)));
    const deferredPrompts = computed(() => props.chat.running ? props.chat.pending.filter(item => item.taskId).length : 0);
    const commands = computed(() => {
      const query = props.chat.draft.trim();
      if (props.group || commandsDismissed.value || !/^\/[a-z]*$/i.test(query)) return [];
      return [
        ...(props.localSession ? [{ command: '/new', label: '重置上下文', description: '下一条消息开启新的 CLI 会话' }] : [
          ...(props.configure ? [{ command: '/task', label: '创建任务', description: '在本会话上方跟踪进展' }] : []),
          { command: '/tasks', label: '列出任务', description: '查看当前智能体的任务' },
        ]),
        { command: '/status', label: '查看状态', description: '显示当前会话状态' },
        { command: '/help', label: '查看帮助', description: '显示可用命令' },
      ].filter(item => item.command.startsWith(query.toLowerCase()));
    });
    watch(() => props.chat.draft, () => { commandsDismissed.value = false; });
    function chooseCommand(command: string) {
      props.chat.draft = command === '/task' ? '/task ' : command;
      commandsDismissed.value = true;
      composer.value?.focus();
    }
    function submit() {
      const text = props.chat.draft.trim();
      const task = /^\/task(?:\s+([\s\S]*))?$/i.exec(text);
      if (task && props.configure && !props.group) {
        commandsDismissed.value = true;
        taskIntent.value = text;
        taskDock.value?.create(task[1] || '');
      } else if (text !== '/') void props.chat.send();
    }
    function taskCreated(task: Task) {
      props.chat.tasks = [task, ...props.chat.tasks.filter(row => row.id !== task.id)];
      if (taskIntent.value && props.chat.draft.trim() === taskIntent.value) props.chat.draft = '';
      taskIntent.value = '';
      emit('refresh');
    }
    const members = computed(() =>
      props.bots.filter((b) => props.group?.members.includes(b.id)),
    );
    const botOf = (id?: string) =>
      props.bots.find((b) => b.id === id) || props.bot;
    const title = computed(
      () => props.group?.name || props.bot?.name || "智能体",
    );
    const transcript = ref<HTMLElement>();
    const dock = ref<HTMLElement>(), activeMessage = ref(''), lastVisibleMessage = ref(''), timelineRoom = ref(false);
    let dockObserver: ResizeObserver | undefined, activeFrame = 0;
    let scrollFrame = 0;
    function updateActiveMessage() {
      if (activeFrame) return;
      activeFrame = requestAnimationFrame(() => {
        activeFrame = 0;
        const rows = transcript.value?.querySelectorAll<HTMLElement>('.message.is-user[data-message-id]');
        if (!rows?.length || !scroller.value) { activeMessage.value = lastVisibleMessage.value = ''; return; }
        const viewport = scroller.value.getBoundingClientRect();
        const visibleTop = Math.max(viewport.top, scroller.value.closest('.chat')?.querySelector('.chat-head')?.getBoundingClientRect().bottom ?? viewport.top);
        const visibleBottom = Math.min(viewport.bottom, dock.value?.getBoundingClientRect().top ?? viewport.bottom);
        function at(line: number) {
          let low=0, high=rows!.length-1;
          while (low < high) {
            const middle=Math.ceil((low+high)/2);
            if (rows![middle].getBoundingClientRect().top <= line) low=middle;
            else high=middle-1;
          }
          return rows![low].dataset.messageId || '';
        }
        activeMessage.value = at(visibleTop + 8);
        lastVisibleMessage.value = at(Math.max(visibleTop + 8, visibleBottom - 1));
      });
    }
    function onScroll() {
      const view=scroller.value;
      if (!view) return;
      nearBottom.value = view.scrollHeight - view.scrollTop - view.clientHeight < 100;
      updateActiveMessage();
    }
    function jump(id: string) {
      const row=transcript.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
      const view = scroller.value;
      if (!row || !view) return;
      nearBottom.value = false;
      activeMessage.value = id;
      const inset = parseFloat(getComputedStyle(view).scrollPaddingTop) || 0;
      view.scrollTo({top:view.scrollTop + row.getBoundingClientRect().top - view.getBoundingClientRect().top - inset - 10,
        behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }
    function scroll() {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        if (nearBottom.value && scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
        updateActiveMessage();
      });
    }
    watch(
      () => props.group?.id || props.bot?.id,
      () => {
        nearBottom.value = true;
        void scroll();
      },
    );
    watch([
      () => props.chat.messages.at(-1)?.id,
      () => props.chat.live?.text,
      () => props.chat.live?.interim?.length,
    ], scroll, { flush:'post' });
    onMounted(() => {
      let dockHeight = -1;
      dockObserver = new ResizeObserver(() => {
        const height = dock.value?.offsetHeight ?? 0;
        if (height !== dockHeight) {
          dockHeight = height;
          dock.value?.parentElement?.style.setProperty('--chat-dock-height', height + 'px');
          scroll();
        } else updateActiveMessage();
        const pane = scroller.value?.getBoundingClientRect(), column = transcript.value?.getBoundingClientRect();
        timelineRoom.value = !!pane && !!column && column.left - pane.left >= 38 &&
          pane.height - height >= 270;
      });
      if (dock.value) dockObserver.observe(dock.value);
      if (scroller.value) dockObserver.observe(scroller.value);
      if (transcript.value) dockObserver.observe(transcript.value);
      scroll();
    });
    onBeforeUnmount(() => { dockObserver?.disconnect(); cancelAnimationFrame(scrollFrame); cancelAnimationFrame(activeFrame); });
    function mention(bot: Bot | null) {
      props.chat.draft += `${props.chat.draft && !props.chat.draft.endsWith(" ") ? " " : ""}@${bot ? bot.id : "所有人"} `;
      composer.value?.focus();
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && commands.value.length) {
        commandsDismissed.value = true;
        event.preventDefault();
        return;
      }
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        if (props.chat.draft.trim() === '/' && commands.value[0]) chooseCommand(commands.value[0].command);
        else submit();
      }
    }
    async function file(conversation: string, value: FileItem) {
      try {
        await downloadFile(conversation, value);
      } catch (e) {
        props.chat.error = (e as Error).message;
      }
    }
    return {
      scroller,
      transcript,
      composer,
      members,
      botOf,
      title,
      mention,
      keydown,
      file,
      question, approvals, deferredPrompts, commands, chooseCommand, submit, taskDock, taskCreated,
      nearBottom,
      dock, activeMessage, lastVisibleMessage, timelineRoom, onScroll, jump,
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
      <ChatTasks v-if="bot && !group" :key="bot.id" ref="taskDock" :bot-id="bot.id" :tasks="chat.tasks" :configure="configure" @created="taskCreated" @updated="chat.tasks = $event" />
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
      <SettingsButton label="智能体设置" @click="$emit('edit')" />
      <button
        v-if="!group"
        class="icon-btn panel-toggle"
        aria-label="信息面板"
        :aria-pressed="infoOpen"
        @click="$emit('info')"
      >
        <Icon :name="infoOpen ? 'panel-open' : 'panel-closed'" />
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
    <div v-if="chat.error || chat.readError" class="error-banner" role="alert">
      <Icon name="info" /><span>{{ chat.error || chat.readError }}</span>
    </div>
    <div
      ref="scroller"
      class="chat-scroll"
      @scroll.passive="onScroll"
    >
      <div v-if="(chat.loading || chat.recovering) && !chat.messages.length && !chat.live" class="empty-state" role="status">
        <span class="loading-ring" />{{ chat.recovering ? '正在同步会话' : '正在加载会话' }}
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
      <div v-if="chat.refreshing && chat.messages.length" class="chat-refresh-status" role="status" aria-label="正在刷新会话"><span class="loading-ring" /></div>
      <div
        ref="transcript"
        class="chat-col ready"
        role="log"
        aria-label="消息记录"
        aria-live="off"
      >
        <article
          v-for="m in chat.messages"
          :key="m.id"
          :data-message-id="String(m.id)"
          class="message"
          :class="{
            'is-user': m.role === 'user',
            'is-system': m.role === 'system',
            'background-notice': m.backgroundNotice,
          }"
        >
          <BotAvatar
            v-if="group && m.role === 'assistant'"
            :bot="botOf(m.botId)"
            :size="30"
          />
          <div class="message-body">
            <div v-if="m.backgroundNotice" class="background-label"><Icon name="tasks" :size="14" />后台任务通知</div>
            <div v-if="group || m.role === 'system'" class="message-meta">
              <strong>{{
                m.role === "user"
                  ? "你"
                  : m.role === "system"
                    ? "系统"
                    : botOf(m.botId)?.name || "智能体"
              }}</strong>
            </div>
            <TurnTranscript v-if="m.role === 'assistant'" :message="m" :conversation-id="chat.conversationId" :eager="m.id === chat.messages.at(-1)?.id">
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
            </TurnTranscript>
            <MessageBubble v-else :text="m.content" :role="m.role" :created-at="m.createdAt" :editable="!group && !localSession && m.role === 'user' && typeof m.id === 'number'" :edit-disabled="chat.submitting || chat.loading" :send-edit="text => chat.edit(m, text)" />
          </div>
        </article>
        <template v-if="chat.live">
          <article :key="chat.live.id" class="message is-live">
            <BotAvatar
              v-if="group"
              :bot="botOf(chat.live.botId)"
              :working="chat.running"
              :size="30"
            />
            <div class="message-body">
              <div v-if="group" class="message-meta"><strong>{{ botOf(chat.live.botId)?.name || "智能体" }}</strong></div>
              <TurnTranscript :live="chat.live" :running="chat.running" :stopping="chat.stopping" :recovering="chat.recovering">
              <button
                v-for="f in chat.live.files"
                :key="f.path"
                class="file-button"
                @click="file(chat.live.conversationId || chat.conversationId, f)"
              ><Icon name="file" />{{ f.name }}</button>
              </TurnTranscript>
            </div>
          </article>
        </template>
        <section
          v-for="item in approvals"
          :key="item.id"
          class="approval-card"
        >
          <h3>
            需要你的授权
          </h3>
          <Markdown
            :text="item.prompt || item.summary || item.title || item.detail"
          />
          <Markdown v-if="item.reason" :text="item.reason" />
            <div v-if="configure" class="button-row">
              <button class="primary-button" @click="chat.answer(item, 'approve')">
                允许</button
              ><button class="quiet-button" @click="chat.answer(item, 'deny')">
                拒绝
              </button>
            </div>
          <p v-else>请联系管理员处理此请求。</p>
        </section>
      </div>
    </div>
    <ConversationTimeline v-if="timelineRoom" :key="chat.conversationId || bot?.id || group?.id" :messages="chat.messages" :conversation-id="chat.conversationId" :active="activeMessage" :last-visible="lastVisibleMessage" @jump="jump" />
    <div ref="dock" class="conversation-dock">
      <TurnFileChanges v-if="chat.running && chat.live" :steps="chat.live.steps || []" running />
      <QueuedMessages :key="chat.conversationId || bot?.id || group?.id" :chat="chat" />
      <p v-if="deferredPrompts" class="deferred-prompts" role="status"><Icon name="tasks" :size="14" />{{ deferredPrompts }} 个后台任务需要处理，当前回复继续生成</p>
      <ComposerQuestion v-if="question && configure" :key="question.id" :item="question" :submit="answer => chat.answer(question!, 'answer', answer)" />
      <p v-else-if="question" class="hint" role="status">有待回答的问题，请联系管理员处理。</p>
      <div v-if="commands.length" class="composer-commands" aria-label="可用命令">
        <button v-for="entry in commands" :key="entry.command" type="button" @click="chooseCommand(entry.command)">
          <Icon :name="entry.command.startsWith('/task') ? 'tasks' : 'info'" :size="15" />
          <span>{{ entry.label }} <small>{{ entry.description }}</small></span><code>{{ entry.command }}</code>
        </button>
      </div>
    <form class="composer-dock" @submit.prevent="submit">
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
          ><BotPermissionControl v-if="bot && !group && !localSession" :bot="bot" :configure="configure" :running="chat.running" @saved="$emit('refresh')" /><HelpTip
            :text="localSession ? 'Enter 发送，Shift + Enter 换行。本机 Agent 使用 CLI 的模型和账号设置。' : 'Enter 发送，Shift + Enter 换行。模型与账户由 Boost 统一管理。'"
          /><span class="grow" /><span v-if="localSession" class="hint">{{ chat.localAgent ? ({ codex: 'Codex', claude: 'Claude Code', deepseek: 'DeepSeek Harness' })[chat.localAgent] : '本机 Agent' }}</span><div v-else-if="!group" class="model-control"
            ><ComposerModelMenu v-if="bot" :bot="bot" :chat="chat" :models="models" :configure="configure" @saved="$emit('refresh')" /></div
          ><span v-else class="hint">成员默认模型</span>
          <button
            v-if="chat.running"
            type="button"
            class="stop-button"
            :disabled="chat.stopping"
            aria-label="停止生成"
            @click="chat.stop()"
          >
            <span class="stop-square" aria-hidden="true" /><span class="sr-only">停止</span></button
          ><button
            v-if="!chat.running || chat.draft.trim()"
            type="submit"
            class="send"
            :aria-label="chat.running ? '加入消息队列' : '发送消息'"
            :disabled="chat.loading || chat.submitting || chat.stopping || !chat.draft.trim()"
          >
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </form>
    </div>
  </section>
</template>
<style scoped>
.stop-button { display:inline-grid; place-items:center; width:30px; height:30px; min-width:30px; padding:0; border:0; border-radius:50%; background:var(--fg); color:var(--bg); }
.stop-square { width:10px; height:10px; border-radius:2px; background:currentColor; }
.stop-button:disabled { opacity:.5; }
.conversation-dock { position:absolute; inset-inline:0; bottom:0; display:grid; width:var(--col); margin:0 auto; gap:6px; padding:4px 0 var(--dock-pb); z-index:var(--z-float); }
.conversation-dock .composer-dock { position:static; padding:0; overflow:visible; scrollbar-gutter:auto; }
.conversation-dock .composer { width:100%; position:relative; background:color-mix(in srgb,var(--bot-neutral-panel) 82%,transparent); backdrop-filter:blur(18px); }
.conversation-dock :deep(.queued-messages) { background:var(--bot-queue-glass); backdrop-filter:blur(16px); }
/* A filtered header is a backdrop root: when the task menu is open, allow
   the menu's own filter to sample the transcript underneath the header. */
:global(.conversation-view > .chat-head:has(.tasks-list)) { backdrop-filter:none; }
:global(html[data-glass="off"]) .conversation-dock .composer,
:global(html[data-glass="off"]) .conversation-dock :deep(.queued-messages) { background:var(--bot-neutral-panel); backdrop-filter:none; }
.conversation-dock:has(.deferred-prompts, .composer-commands) :deep(.queued-messages) { margin-bottom:0; }
.conversation-view .chat-scroll { mask-image:none; }
.conversation-view .chat-col { padding-bottom:calc(var(--chat-dock-height, 76px) + var(--space-5)); }
.conversation-view .chat-scroll { scroll-padding-bottom:var(--chat-dock-height, 76px); }
.background-notice .message-body { padding:9px 12px; border-radius:13px; border:1px solid var(--line); background:var(--pill); }
.background-label, .deferred-prompts { display:flex; align-items:center; gap:7px; color:var(--muted); font-size:var(--fs-xs); margin:0; }
.conversation-view > .error-banner { margin-top:var(--head-h); }
.conversation-view:has(> .member-strip) > .error-banner { margin-top:0; }
.composer-commands { display:grid; gap:2px; padding:4px; border:1px solid var(--line); border-radius:12px; background:var(--surface-solid); }
.composer-commands button { display:flex; align-items:center; gap:8px; min-height:32px; padding:4px 8px; border-radius:7px; text-align:left; }
.composer-commands button:hover, .composer-commands button:focus-visible { background:var(--pill-hover); }
.composer-commands code { margin-inline-start:auto; }
.composer-commands :is(code, small) { color:var(--muted); font-size:11px; }
</style>
