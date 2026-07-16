<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowRight, BookOpen, FileText, Network, Search } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { courses } from '../../data/courses'

const props = defineProps<{ domain?: any }>()
const route = useRoute()
const items = ref<any[]>([])
const total = ref(0)
const query = ref('')
const loading = ref(false)
const domainKey = computed(() => String(route.params.domain))
const universityCourses = computed(() =>
  domainKey.value === 'university' ? courses.filter((c) => c.id !== 'gaokao') : [],
)

async function load() {
  if (!props.domain?.id) return
  loading.value = true
  const params = new URLSearchParams({ domainId: props.domain.id, limit: '18' })
  if (query.value.trim()) params.set('q', query.value.trim())
  const response = await fetch(`/api/knowledge/materials?${params}`)
  if (response.ok) {
    const body = await response.json()
    items.value = body.items || []
    total.value = body.pageInfo?.total || 0
  }
  loading.value = false
}
watch(() => props.domain?.id, load)
onMounted(load)
</script>

<template>
  <main id="main-content" class="workspace-main">
    <section class="workspace-intro">
      <div>
        <p class="workspace-kicker">
          <BookOpen :size="15" />{{ props.domain?.name || '学习' }}资料域
        </p>
        <h1>课程、资料与知识关系，在同一个空间里。</h1>
        <p>{{ props.domain?.description || '统一检索资料、追踪知识关系并保存个人学习状态。' }}</p>
      </div>
      <RouterLink class="workspace-primary" :to="`/workspace/${domainKey}/graph`"
        ><Network :size="18" />打开知识图谱<ArrowRight :size="17"
      /></RouterLink>
    </section>
    <section v-if="universityCourses.length" class="workspace-band">
      <div class="workspace-section-head">
        <div>
          <p class="workspace-kicker">课程</p>
          <h2>大学课程</h2>
        </div>
        <span>{{ universityCourses.length }} 门</span>
      </div>
      <div class="workspace-course-grid">
        <RouterLink
          v-for="course in universityCourses"
          :key="course.id"
          :to="`/courses/${course.id}`"
          :style="{ '--course-accent': course.accent }"
          ><span></span>
          <div>
            <h3>{{ course.name }}</h3>
            <p>{{ course.description }}</p>
          </div>
          <ArrowRight :size="18"
        /></RouterLink>
      </div>
    </section>
    <section id="materials" class="workspace-band">
      <div class="workspace-section-head">
        <div>
          <p class="workspace-kicker">通用知识库</p>
          <h2>已索引资料</h2>
        </div>
        <span>{{ total.toLocaleString('zh-CN') }} 项</span>
      </div>
      <label class="workspace-search"
        ><Search :size="19" /><span class="sr-only">搜索资料</span
        ><input
          v-model="query"
          type="search"
          placeholder="搜索文件、课程或知识点"
          @keyup.enter="load"
        /><button type="button" @click="load">搜索</button></label
      >
      <div class="workspace-material-list">
        <article v-for="item in items" :key="item.id">
          <FileText :size="20" />
          <div>
            <h3>{{ item.fileName }}</h3>
            <p>
              {{ item.subject }} · {{ item.kind
              }}<template v-if="item.year"> · {{ item.year }}</template>
            </p>
          </div>
          <span :class="{ indexed: item.ragStatus === 'indexed' }">{{
            item.ragStatus === 'indexed' ? '可检索' : '目录'
          }}</span>
        </article>
        <p v-if="!items.length && !loading" class="workspace-empty">这个资料域还没有已登记资料。</p>
      </div>
    </section>
  </main>
</template>
