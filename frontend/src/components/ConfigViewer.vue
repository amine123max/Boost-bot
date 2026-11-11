<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ content: string; path?: string }>();
const lines = computed(() =>
  props.content.split("\n").map((text) => ({
    text,
    match: text.match(/^(\s*(?:[\w.-]+|"[^"]+"))\s*(=)(.*)$/),
  })),
);
</script>
<template>
  <div
    class="config-viewer"
    tabindex="0"
    role="region"
    aria-label="Codex config.toml"
  >
    <div v-for="(line, index) in lines" :key="index" class="config-line">
      <span class="line-number" aria-hidden="true">{{ index + 1 }}</span
      ><code
        ><template v-if="line.match"
          ><span class="toml-key">{{ line.match[1] }}</span
          ><span> = </span
          ><span class="toml-value">{{
            line.match[3].trimStart()
          }}</span></template
        ><span
          v-else
          :class="{
            'toml-section': line.text.trim().startsWith('['),
            'toml-comment': line.text.trim().startsWith('#'),
          }"
          >{{ line.text || " " }}</span
        ></code
      >
    </div>
  </div>
</template>
