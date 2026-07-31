<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Globe2 } from 'lucide-vue-next'

const feishuAppId = ref('')
const feishuAppSecret = ref('')
const feishuSpaceId = ref('')
const feishuBusy = ref(false)
const feishuMessage = ref('')

async function api(path: string, init: Parameters<typeof fetch>[1] = {}) {
  const response = await fetch(path, { ...init, credentials: 'include' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

async function loadFeishuConfig() {
  try {
    const config = await api('/api/admin/knowledge/feishu-sync')
    feishuAppId.value = config.appId || ''
    feishuAppSecret.value = config.appSecret || ''
    feishuSpaceId.value = config.spaceId || ''
  } catch (e) {
    console.error('Failed to load Feishu config', e)
  }
}

async function saveFeishuConfig() {
  feishuBusy.value = true
  feishuMessage.value = ''
  try {
    await api('/api/admin/knowledge/feishu-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: feishuAppId.value,
        appSecret: feishuAppSecret.value,
        spaceId: feishuSpaceId.value,
      }),
    })
    feishuMessage.value = '飞书同步配置已保存'
  } catch (e) {
    feishuMessage.value = e instanceof Error ? e.message : '保存配置失败'
  } finally {
    feishuBusy.value = false
  }
}

async function runFeishuSync() {
  feishuBusy.value = true
  feishuMessage.value = ''
  try {
    await api('/api/admin/knowledge/feishu-sync/run', { method: 'POST' })
    feishuMessage.value = '已触发飞书知识库文档同步后台任务'
  } catch (e) {
    feishuMessage.value = e instanceof Error ? e.message : '触发同步失败'
  } finally {
    feishuBusy.value = false
  }
}

onMounted(() => {
  void loadFeishuConfig()
})
</script>

<template>
  <article class="hs-admin-card hs-upload-card">
    <header>
      <Globe2 :size="20" />
      <div>
        <h2>飞书知识库同步</h2>
        <p>配置飞书应用凭据并手动触发从飞书空间同步文档内容。</p>
      </div>
    </header>
    <form @submit.prevent="saveFeishuConfig">
      <label>App ID<input v-model="feishuAppId" required /></label>
      <label
        >App Secret<input v-model="feishuAppSecret" type="password" placeholder="********"
      /></label>
      <label>知识空间 ID<input v-model="feishuSpaceId" required /></label>
      <div style="display: flex; gap: 0.5rem; margin-top: 1rem">
        <button type="submit" :disabled="feishuBusy">保存配置</button>
        <button type="button" :disabled="feishuBusy" @click="runFeishuSync">触发同步</button>
      </div>
      <p v-if="feishuMessage" aria-live="polite">{{ feishuMessage }}</p>
    </form>
  </article>
</template>
