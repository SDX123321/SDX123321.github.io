<script setup lang="ts">
import { RouterView } from 'vue-router'
import { Moon, Sun } from 'lucide-vue-next'
import { useTheme } from './composables/useTheme'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <RouterView />
  <button
    class="theme-switch"
    type="button"
    :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
    :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
    @click="toggleTheme"
  >
    <Sun v-if="isDark" :size="18" aria-hidden="true" />
    <Moon v-else :size="18" aria-hidden="true" />
  </button>
</template>
