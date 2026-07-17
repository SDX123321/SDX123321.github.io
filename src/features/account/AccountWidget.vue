<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../../composables/useAuth'
import { formatStudyTime } from './progressSnapshot'

const { user, stats, apiAvailable, login, register, logout } = useAuth()

const open = ref(false)
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const message = ref('')
const busy = ref(false)

async function submit(event: Event) {
  event.preventDefault()
  busy.value = true
  message.value = ''
  try {
    if (mode.value === 'register') {
      await register(username.value, password.value)
    } else {
      await login(username.value, password.value)
    }
    password.value = ''
    message.value = '已登录，并自动导入本机学习记录。'
  } catch (error: unknown) {
    const copy: Record<string, string> = {
      username_exists: '这个用户名已经存在。',
      invalid_credentials: '用户名或密码不正确。',
      invalid_input: '用户名至少 3 位，密码至少 6 位。',
    }
    const msg = (error as Error).message
    message.value = copy[msg] || '账号服务暂时不可用。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <button type="button" class="account-entry" @click="open = true">
    {{ user?.username ?? '登录 / 注册' }}
    <span v-if="!apiAvailable">未同步</span>
  </button>

  <Teleport to="body">
    <div v-if="open" class="account-overlay" @mousedown.self="open = false">
      <section class="account-panel" @mousedown.stop>
        <button type="button" class="account-close" aria-label="关闭" @click="open = false">
          ×
        </button>
        <div class="account-head">
          <span>账号中心</span>
          <h2>{{ user ? `你好，${user.username}` : '登录后同步学习记录' }}</h2>
          <p>
            {{
              apiAvailable
                ? '学习进度会保存到本机 Postgres 账号。'
                : '账号 API 未连接，页面会继续使用本地记录。'
            }}
          </p>
        </div>

        <!-- 已登录 -->
        <template v-if="user">
          <div class="account-grid">
            <div class="account-stat">
              <strong>{{ formatStudyTime(stats?.totalStudySeconds ?? 0) }}</strong>
              <span>累计学习</span>
            </div>
            <div class="account-stat">
              <strong>{{ stats?.chapterDoneCount ?? 0 }}</strong>
              <span>章节完成</span>
            </div>
            <div class="account-stat">
              <strong>{{ stats?.wrongCount ?? 0 }}</strong>
              <span>错题记录</span>
            </div>
            <div class="account-stat">
              <strong>{{ stats?.practiceDoneCount ?? 0 }}</strong>
              <span>练习完成</span>
            </div>
            <div class="account-stat">
              <strong>{{ stats?.masteryItemCount ?? 0 }}</strong>
              <span>掌握记录</span>
            </div>
            <div class="account-stat">
              <strong>{{ stats?.currentStreakDays ?? 0 }} 天</strong>
              <span>连续学习</span>
            </div>
          </div>
          <div class="account-recent">
            <strong>最近阅读</strong>
            <ul v-if="(stats?.recentPaths ?? []).length > 0">
              <li v-for="path in stats!.recentPaths" :key="path">{{ path }}</li>
            </ul>
            <p v-else>暂无账号侧记录，继续学习后会自动出现。</p>
          </div>
          <button type="button" class="account-submit account-logout" @click="logout">
            退出登录
          </button>
        </template>

        <!-- 未登录 -->
        <form v-else class="account-form" @submit="submit">
          <div class="account-tabs">
            <button type="button" :class="{ active: mode === 'login' }" @click="mode = 'login'">
              登录
            </button>
            <button
              type="button"
              :class="{ active: mode === 'register' }"
              @click="mode = 'register'"
            >
              注册
            </button>
          </div>
          <label>
            用户名
            <input v-model="username" autocomplete="username" />
          </label>
          <label>
            密码
            <input
              v-model="password"
              type="password"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            />
          </label>
          <button type="submit" class="account-submit" :disabled="busy">
            {{ busy ? '处理中...' : mode === 'login' ? '登录' : '注册并登录' }}
          </button>
          <p v-if="message" class="account-message">{{ message }}</p>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.account-entry {
  position: fixed;
  top: 14px;
  right: 60px;
  z-index: 90;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font-size: 0.82rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.account-entry span {
  font-size: 0.7rem;
  color: var(--warning, #fbbf24);
}
.account-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.account-panel {
  background: var(--card, #1a1d27);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 28px;
  max-width: 480px;
  width: 92vw;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
}
.account-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  font-size: 1.3rem;
  color: var(--text3);
  cursor: pointer;
  line-height: 1;
}
.account-head {
  margin-bottom: 20px;
}
.account-head span {
  font-size: 0.78rem;
  color: var(--text3);
}
.account-head h2 {
  margin: 4px 0 8px;
  font-size: 1.05rem;
}
.account-head p {
  font-size: 0.82rem;
  color: var(--text2);
  margin: 0;
}
.account-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.account-stat {
  background: var(--card2, #22263a);
  border-radius: 10px;
  padding: 12px;
  text-align: center;
}
.account-stat strong {
  display: block;
  font-size: 1.1rem;
  color: var(--accent, #6c8aff);
}
.account-stat span {
  font-size: 0.72rem;
  color: var(--text3);
}
.account-recent {
  margin-bottom: 16px;
}
.account-recent strong {
  font-size: 0.85rem;
  color: var(--text2);
  display: block;
  margin-bottom: 6px;
}
.account-recent ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.account-recent li {
  font-size: 0.78rem;
  color: var(--text3);
  padding: 3px 0;
  border-bottom: 1px solid var(--border);
}
.account-recent p {
  font-size: 0.82rem;
  color: var(--text3);
  margin: 0;
}
.account-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.account-tabs button {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text2);
  cursor: pointer;
  font-size: 0.88rem;
}
.account-tabs button.active {
  background: var(--accent, #6c8aff);
  color: #fff;
  border-color: var(--accent);
}
.account-form label {
  display: block;
  font-size: 0.85rem;
  color: var(--text2);
  margin-bottom: 12px;
}
.account-form input {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 0.88rem;
  box-sizing: border-box;
}
.account-submit {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: none;
  background: var(--accent, #6c8aff);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.account-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.account-logout {
  background: var(--danger, #ef4444);
}
.account-message {
  font-size: 0.82rem;
  color: var(--warning, #fbbf24);
  margin-top: 10px;
}
</style>
