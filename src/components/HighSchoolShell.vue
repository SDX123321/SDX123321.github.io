<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import {
  BookOpenCheck,
  Bot,
  Download,
  GraduationCap,
  Library,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  Network,
  Settings,
  X,
} from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'
import HighSchoolOnboarding from './HighSchoolOnboarding.vue'

const auth = useAuth()
const menuOpen = ref(false)
const authOpen = ref(false)
const authMode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const error = ref('')

function rememberEdition(edition: 'high-school' | 'university') {
  localStorage.setItem('review_edition', edition)
}

async function submitAuth() {
  error.value = ''
  try {
    await auth[authMode.value](username.value, password.value)
    authOpen.value = false
    password.value = ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '登录失败，请稍后再试'
  }
}

function toggleAuthMode() {
  authMode.value = authMode.value === 'login' ? 'register' : 'login'
  error.value = ''
}
</script>

<template>
  <div class="hs-app">
    <header class="hs-header">
      <RouterLink
        class="hs-brand"
        to="/high-school"
        aria-label="高中学习站首页"
        @click="rememberEdition('high-school')"
      >
        <span><GraduationCap :size="22" /></span>
        <strong>高中学习站</strong>
      </RouterLink>
      <button
        class="hs-menu-button"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="hs-navigation"
        @click="menuOpen = !menuOpen"
      >
        <X v-if="menuOpen" :size="20" /><Menu v-else :size="20" /><span class="sr-only"
          >切换导航</span
        >
      </button>
      <nav id="hs-navigation" class="hs-nav" :class="{ open: menuOpen }" aria-label="高中版主导航">
        <RouterLink to="/high-school" @click="menuOpen = false"
          ><BookOpenCheck :size="17" />学习台</RouterLink
        >
        <RouterLink to="/high-school/resources" @click="menuOpen = false"
          ><Library :size="17" />资料库</RouterLink
        >
        <RouterLink to="/high-school/assistant" @click="menuOpen = false"
          ><Bot :size="17" />AI 助学</RouterLink
        >
        <RouterLink to="/high-school/practice" @click="menuOpen = false"
          ><Download :size="17" />真题练习</RouterLink
        >
        <RouterLink to="/high-school/knowledge-graph/math" @click="menuOpen = false"
          ><Network :size="17" />知识图谱</RouterLink
        >
        <RouterLink v-if="auth.user" to="/high-school/settings" @click="menuOpen = false"
          ><Settings :size="17" />设置</RouterLink
        >
        <RouterLink
          v-if="auth.user?.role === 'admin'"
          to="/high-school/admin"
          @click="menuOpen = false"
          ><ShieldCheck :size="17" />管理后台</RouterLink
        >
      </nav>
      <div class="hs-header-actions">
        <RouterLink class="hs-edition" to="/" @click="rememberEdition('university')"
          >大学版</RouterLink
        >
        <button
          v-if="auth.user"
          class="hs-user"
          type="button"
          :aria-label="`退出登录：${auth.user.username}`"
          @click="auth.logout"
        >
          <span>{{ auth.user.username }}</span
          ><LogOut :size="16" />
        </button>
        <button v-else class="hs-login" type="button" @click="authOpen = true">
          <LogIn :size="16" />登录
        </button>
      </div>
    </header>
    <div v-if="auth.mustChangePassword" class="hs-password-banner" role="alert">
      这是一次性管理员密码。请先前往
      <RouterLink to="/high-school/settings">个人设置</RouterLink> 修改密码，之后才能使用管理后台。
    </div>

    <RouterView @require-auth="authOpen = true" />
    <HighSchoolOnboarding />

    <div
      v-if="authOpen"
      class="hs-modal-backdrop"
      role="presentation"
      @mousedown.self="authOpen = false"
    >
      <section class="hs-auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button class="hs-modal-close" type="button" aria-label="关闭" @click="authOpen = false">
          <X :size="18" />
        </button>
        <span class="hs-modal-icon"><GraduationCap :size="24" /></span>
        <p class="hs-kicker">同步学习进度</p>
        <h2 id="auth-title">{{ authMode === 'login' ? '欢迎回来' : '创建学生账号' }}</h2>
        <form @submit.prevent="submitAuth">
          <label
            >用户名<input
              v-model="username"
              autocomplete="username"
              minlength="3"
              maxlength="32"
              required
          /></label>
          <label
            >密码<input
              v-model="password"
              type="password"
              :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'"
              minlength="6"
              required
          /></label>
          <p v-if="error" class="hs-form-error" role="alert">{{ error }}</p>
          <button class="hs-primary-button" type="submit" :disabled="auth.busy">
            {{ auth.busy ? '请稍候…' : authMode === 'login' ? '登录并继续' : '注册并继续' }}
          </button>
        </form>
        <button class="hs-auth-switch" type="button" @click="toggleAuthMode">
          {{ authMode === 'login' ? '没有账号？立即注册' : '已有账号？返回登录' }}
        </button>
      </section>
    </div>
  </div>
</template>
