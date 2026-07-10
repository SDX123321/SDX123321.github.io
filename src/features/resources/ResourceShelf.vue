<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, FileArchive, FileText, Search, SlidersHorizontal } from 'lucide-vue-next'
import { FILES as filesRaw } from '../../data/files.js'

interface ResourceFile {
  s: string
  sn: string
  c: string
  n: string
  p: string
  sz: string
  t: string
  tn: string
}
const files = filesRaw as ResourceFile[]
const query = ref('')
const subject = ref('all')
const type = ref('all')
const visible = ref(12)
const subjects = computed(() =>
  [...new Map(files.map((file) => [file.s, file.sn])).entries()].map(([key, name]) => ({
    key,
    name,
  })),
)
const types = computed(() =>
  [...new Map(files.map((file) => [file.t, file.tn])).entries()].map(([key, name]) => ({
    key,
    name,
  })),
)
const filtered = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase('zh-CN')
  return files.filter(
    (file) =>
      (subject.value === 'all' || file.s === subject.value) &&
      (type.value === 'all' || file.t === type.value) &&
      (!keyword || `${file.n} ${file.sn} ${file.tn}`.toLocaleLowerCase('zh-CN').includes(keyword)),
  )
})
function resetVisible() {
  visible.value = 12
}
</script>

<template>
  <section id="resources" class="resource-section page-container" aria-labelledby="resources-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">复习资料库</p>
        <h2 id="resources-title">课件、试卷与参考资料</h2>
      </div>
      <p>{{ filtered.length }} 份文件</p>
    </div>
    <div class="resource-toolbar">
      <div class="resource-search">
        <Search :size="18" /><label class="sr-only" for="resource-search">搜索复习资料</label
        ><input
          id="resource-search"
          v-model="query"
          type="search"
          placeholder="搜索文件名…"
          @input="resetVisible"
        />
      </div>
      <label
        ><span class="sr-only">选择课程</span
        ><select v-model="subject" @change="resetVisible">
          <option value="all">全部课程</option>
          <option v-for="item in subjects" :key="item.key" :value="item.key">
            {{ item.name }}
          </option>
        </select></label
      >
      <label
        ><span class="sr-only">选择资料类型</span
        ><select v-model="type" @change="resetVisible">
          <option value="all">全部类型</option>
          <option v-for="item in types" :key="item.key" :value="item.key">{{ item.name }}</option>
        </select></label
      >
      <SlidersHorizontal :size="18" aria-hidden="true" />
    </div>
    <div v-if="filtered.length" class="resource-grid">
      <a
        v-for="file in filtered.slice(0, visible)"
        :key="file.p"
        class="resource-card"
        :href="file.p"
        target="_blank"
        rel="noopener noreferrer"
        :style="{ '--file-color': file.c }"
      >
        <span class="resource-file-icon"
          ><FileArchive v-if="/ppt|slide/i.test(file.t)" :size="20" /><FileText v-else :size="20"
        /></span>
        <div>
          <small>{{ file.sn }} · {{ file.tn }}</small
          ><strong>{{ file.n }}</strong
          ><span>{{ file.sz }}</span>
        </div>
        <ExternalLink :size="16" />
      </a>
    </div>
    <div v-else class="no-results">
      <Search :size="28" />
      <h3>没有匹配的资料</h3>
      <p>换一个关键词或筛选条件试试。</p>
    </div>
    <button v-if="visible < filtered.length" class="load-more" type="button" @click="visible += 12">
      继续加载（还剩 {{ filtered.length - visible }} 份）
    </button>
  </section>
</template>
