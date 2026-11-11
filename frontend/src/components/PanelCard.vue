<script setup lang="ts">
import BoostIcon from "./BoostIcon.vue";
defineProps<{ title?: string; icon?: string; tone?: string }>();
</script>
<template>
  <section class="panel">
    <header v-if="title" class="panel-header">
      <span v-if="icon" class="icon-tile" :class="tone"
        ><BoostIcon :name="icon"
      /></span>
      <h2>{{ title }}</h2>
      <div class="panel-actions"><slot name="actions" /></div>
    </header>
    <div class="panel-body"><slot /></div>
  </section>
</template>
