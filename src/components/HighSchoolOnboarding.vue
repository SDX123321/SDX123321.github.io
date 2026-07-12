<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Check, GraduationCap, Sparkles, X } from 'lucide-vue-next'
import { useAuth } from '../composables/useAuth'
const auth = useAuth(),
  open = ref(false),
  step = ref(1),
  grade = ref(''),
  subjects = ref<string[]>([]),
  provider = ref('')
const options = [
  ['chinese', '语文'],
  ['math', '数学'],
  ['english', '英语'],
  ['physics', '物理'],
  ['chemistry', '化学'],
  ['biology', '生物'],
  ['politics', '政治'],
  ['history', '历史'],
  ['geography', '地理'],
]
const providers = ref<any[]>([])
async function load() {
  if (!auth.user) return
  const p = await fetch('/api/me/preferences', { credentials: 'include' })
  if (!p.ok) return
  const data = await p.json()
  grade.value = data.grade || ''
  subjects.value = data.subjects || []
  if (!data.onboardingCompleted) open.value = true
  const r = await fetch('/api/me/ai-providers', { credentials: 'include' })
  if (r.ok) providers.value = (await r.json()).providers || []
}
async function finish() {
  await fetch('/api/me/preferences', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grade: grade.value || null,
      subjects: subjects.value,
      defaultProviderId: provider.value || null,
      completeOnboarding: true,
    }),
  })
  open.value = false
}
watch(() => auth.user?.id, load)
onMounted(load)
</script>
<template>
  <div v-if="open" class="hs-modal-backdrop hs-onboarding" @mousedown.self="open = false">
    <section role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <button class="hs-modal-close" aria-label="暂时跳过" @click="open = false">
        <X :size="18" />
      </button>
      <div class="hs-onboarding-progress" aria-label="引导进度">
        <span v-for="n in 3" :key="n" :class="{ active: n <= step }"></span>
      </div>
      <p class="hs-kicker"><Sparkles :size="15" />第一次见面</p>
      <template v-if="step === 1"
        ><GraduationCap :size="34" />
        <h2 id="onboarding-title">你现在读几年级？</h2>
        <p>我们会优先展示与你当前阶段相关的资料和练习。</p>
        <div class="hs-choice-grid">
          <button
            v-for="g in [
              ['grade-1', '高一'],
              ['grade-2', '高二'],
              ['grade-3', '高三'],
            ]"
            :key="g[0]"
            :aria-pressed="grade === g[0]"
            @click="grade = g[0]"
          >
            {{ g[1] }}
          </button>
        </div></template
      ><template v-else-if="step === 2"
        ><h2 id="onboarding-title">最近重点复习哪些学科？</h2>
        <p>可多选，以后随时能在设置中调整。</p>
        <div class="hs-choice-grid subjects">
          <label v-for="s in options" :key="s[0]"
            ><input v-model="subjects" type="checkbox" :value="s[0]" />{{ s[1] }}</label
          >
        </div></template
      ><template v-else
        ><h2 id="onboarding-title">选择默认回答模型</h2>
        <p>本地 Qwen 无需 API Key，你也可以稍后在设置中添加 Provider。</p>
        <div class="hs-choice-grid providers">
          <button :aria-pressed="provider === ''" @click="provider = ''">本地 Qwen</button
          ><button
            v-for="p in providers"
            :key="p.id"
            :aria-pressed="provider === p.id"
            @click="provider = p.id"
          >
            {{ p.name }} · {{ p.model }}
          </button>
        </div></template
      >
      <footer>
        <button v-if="step > 1" @click="step--"><ArrowLeft :size="17" />上一步</button
        ><button v-if="step < 3" class="hs-primary-button" @click="step++">
          下一步<ArrowRight :size="17" /></button
        ><button v-else class="hs-primary-button" @click="finish">
          <Check :size="17" />开始复习
        </button>
      </footer>
    </section>
  </div>
</template>
