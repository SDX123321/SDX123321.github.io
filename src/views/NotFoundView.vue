<script setup lang="ts">
import { ArrowLeft, Compass } from 'lucide-vue-next'
</script>

<template>
  <main id="main-content" class="empty-state">
    <Compass :size="34" aria-hidden="true" />
    <p class="eyebrow">404</p>
    <h1>这页笔记还没写</h1>
    <p>链接可能已经更新，回到首页继续复习吧。</p>
    <RouterLink class="primary-button" to="/"><ArrowLeft :size="18" />返回首页</RouterLink>
  </main>
</template>
