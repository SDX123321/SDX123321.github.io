<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  BookOpen,
  Boxes,
  LogIn,
  LogOut,
  Network,
  PanelLeft,
  Search,
  Settings,
} from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const auth = useAuth()
const menuOpen = ref(false)
const domains = ref<any[]>([])
const domainKey = computed(() => String(route.params.domain || 'high-school'))
const domain = computed(() => domains.value.find((item) => item.key === domainKey.value))

onMounted(async () => {
  await auth.refresh()
  const response = await fetch('/api/domains')
  if (response.ok) domains.value = (await response.json()).domains || []
})
</script>

<template>
  <div class="workspace-shell">
    <header class="workspace-header">
      <RouterLink class="workspace-brand" :to="`/workspace/${domainKey}`">
        <span><Boxes :size="20" /></span>
        <strong>知识空间</strong>
        <small>{{ domain?.name || (domainKey === 'university' ? '大学' : '高中') }}</small>
      </RouterLink>
      <button
        class="workspace-menu"
        type="button"
        :aria-expanded="menuOpen"
        aria-label="打开导航"
        @click="menuOpen = !menuOpen"
      >
        <PanelLeft :size="20" />
      </button>
      <nav :class="{ 'is-open': menuOpen }" aria-label="知识空间导航">
        <RouterLink :to="`/workspace/${domainKey}`"><BookOpen :size="17" />概览</RouterLink>
        <RouterLink :to="`/workspace/${domainKey}/graph`"
          ><Network :size="17" />知识图谱</RouterLink
        >
        <RouterLink :to="`/workspace/${domainKey}?focus=materials`"
          ><Search :size="17" />资料库</RouterLink
        >
      </nav>
      <div class="workspace-actions">
        <label class="domain-switch"
          ><span class="sr-only">切换资料域</span
          ><select
            :value="domainKey"
            @change="$router.push(`/workspace/${($event.target as HTMLSelectElement).value}`)"
          >
            <option v-for="item in domains" :key="item.id" :value="item.key">
              {{ item.name }}
            </option>
            <option v-if="!domains.length" value="high-school">高中</option>
            <option v-if="!domains.length" value="university">大学</option>
          </select></label
        >
        <RouterLink
          v-if="auth.user"
          class="workspace-icon-button"
          to="/high-school/settings"
          title="账号设置"
          ><Settings :size="18"
        /></RouterLink>
        <button v-if="auth.user" class="workspace-account" type="button" @click="auth.logout">
          <span>{{ auth.user.username }}</span
          ><LogOut :size="17" />
        </button>
        <RouterLink v-else class="workspace-account" to="/high-school"
          ><LogIn :size="17" /><span>登录</span></RouterLink
        >
      </div>
    </header>
    <RouterView :domain="domain" />
  </div>
</template>
