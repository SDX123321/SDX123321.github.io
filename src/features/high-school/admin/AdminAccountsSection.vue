<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Users } from 'lucide-vue-next'

const search = ref('')
const accounts = ref<any[]>([])
const loading = ref(false)
const error = ref('')

async function api(path: string, init: Parameters<typeof fetch>[1] = {}) {
  const response = await fetch(path, { ...init, credentials: 'include' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

async function loadAccounts() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ limit: '50' })
    if (search.value.trim()) params.set('q', search.value.trim())
    const accountBody = await api(`/api/admin/accounts?${params}`)
    accounts.value = accountBody.accounts || []
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载账号列表失败'
  } finally {
    loading.value = false
  }
}

async function risk(account: any, action: 'suspend' | 'activate' | 'revoke_sessions') {
  try {
    await api(`/api/admin/accounts/${account.id}/risk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    await loadAccounts()
  } catch (e) {
    alert(e instanceof Error ? e.message : '风控操作失败')
  }
}

onMounted(() => {
  void loadAccounts()
})
</script>

<template>
  <section class="hs-container hs-admin-card hs-account-card">
    <header>
      <Users :size="20" />
      <div>
        <h2>账户用量与风控</h2>
        <p>暂停账号会立即撤销其全部登录会话。</p>
      </div>
      <form class="hs-admin-search" @submit.prevent="loadAccounts">
        <label class="sr-only" for="admin-account-search">搜索账号</label>
        <input id="admin-account-search" v-model.trim="search" placeholder="搜索用户名" />
        <button type="submit">查询</button>
      </form>
    </header>
    <div class="hs-admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>账号</th>
            <th>状态</th>
            <th>学习时长</th>
            <th>练习</th>
            <th>AI 调用</th>
            <th>会话</th>
            <th>最近登录</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="account in accounts" :key="account.id">
            <td>
              <strong>{{ account.username }}</strong>
              <small>{{ account.role }}</small>
            </td>
            <td>
              <span class="hs-risk-badge" :data-risk="account.riskStatus">{{
                account.riskStatus
              }}</span>
            </td>
            <td>{{ Math.round(account.studySeconds / 60) }} 分钟</td>
            <td>{{ account.practiceCount }}</td>
            <td>{{ account.aiCalls }}</td>
            <td>{{ account.activeSessions }}</td>
            <td>
              {{
                account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : '从未登录'
              }}
            </td>
            <td>
              <div class="hs-admin-actions">
                <button
                  v-if="account.riskStatus === 'active'"
                  type="button"
                  @click="risk(account, 'suspend')"
                >
                  暂停
                </button>
                <button v-else type="button" @click="risk(account, 'activate')">恢复</button>
                <button type="button" @click="risk(account, 'revoke_sessions')">下线</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
