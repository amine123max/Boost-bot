<script setup lang="ts">
import { ref, useId } from 'vue';
import Icon from './Icon.vue';
import SpringDisclosure from './SpringDisclosure.vue';
import CopyButton from './CopyButton.vue';

defineProps<{command:string;output?:string;success:boolean}>();
const open = ref(false);
const id = useId();
</script>

<template>
  <div class="shell-detail">
    <button type="button" class="shell-trigger" :aria-expanded="open" :aria-controls="id" @click="open = !open">
      <Icon name="terminal" :size="16" /><span>{{ success ? '已运行命令' : '命令未完成' }}</span><Icon name="chevron" :size="12" class="shell-chevron" />
    </button>
    <SpringDisclosure :id="id" :open="open">
      <div class="shell-output">
        <div>Shell</div>
        <div class="shell-command">
          <pre><code>{{ '$ ' + command }}</code></pre>
          <CopyButton class="shell-copy" label="复制命令" :text="command" :size="15" />
        </div>
        <pre v-if="output" class="shell-stdout" tabindex="0" aria-label="命令输出"><code>{{ output }}</code></pre>
        <div class="shell-result"><Icon :name="success ? 'check' : 'info'" :size="13" />{{ success ? '成功' : '未完成' }}</div>
      </div>
    </SpringDisclosure>
  </div>
</template>

<style scoped>
.shell-trigger { display:flex; align-items:center; gap:8px; min-height:25px; color:inherit; }
.shell-trigger:hover { color:var(--fg); }
.shell-chevron { transition:transform 220ms ease-out; }
.shell-trigger[aria-expanded="true"] .shell-chevron { transform:rotate(90deg); }
.shell-output { margin:3px 0 6px; padding:8px 10px; border:1px solid var(--line); border-radius:10px; background:var(--bot-neutral-panel); }
.shell-output pre { margin:0; font:inherit; line-height:var(--lh-prose); white-space:pre-wrap; overflow-wrap:anywhere; }
.shell-output code { color:inherit; background:transparent; font:inherit; }
.shell-command { display:flex; gap:8px; align-items:flex-start; margin:7px 0 2px; }
.shell-command pre { flex:1; min-width:0; }
.shell-stdout { max-height:min(34dvh, 280px); overflow:auto; scrollbar-width:none; }
.shell-stdout::-webkit-scrollbar { display:none; }
.shell-copy { opacity:0; flex:none; padding:3px; color:inherit; }
.shell-command:hover .shell-copy { opacity:1; transition:opacity 0s 500ms; }
.shell-command:focus-within .shell-copy { opacity:1; transition:none; }
.shell-copy[data-copied] { opacity:1; }
.shell-result { display:flex; align-items:center; justify-content:flex-end; gap:5px; margin-top:5px; }
@media (hover:none) { .shell-copy { opacity:1; } }
@media (prefers-reduced-motion:reduce) { .shell-chevron { transition:none; } }
</style>
