<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Download, ExternalLink, FileText, X } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  source: any
  loading?: boolean
}>()
const emit = defineEmits<{ (event: 'close'): void }>()

type PreviewMode = 'text' | 'pdf' | 'docx' | 'image' | 'audio'

const mode = ref<PreviewMode>('text')
const docxHtml = ref('')
const pluginLoading = ref(false)
const pluginError = ref('')
let previewVersion = 0

const material = computed(() => props.source?.material)
const fileUrl = computed(() =>
  material.value?.id ? `/api/high-school/materials/${material.value.id}/file-preview` : '',
)
const downloadUrl = computed(() =>
  material.value?.id ? `/api/high-school/materials/${material.value.id}/download` : '',
)

function detectMode(): PreviewMode {
  const extension = String(material.value?.fileExt || '')
    .replace(/^\./, '')
    .toLowerCase()
  const mime = String(material.value?.mimeType || '').toLowerCase()
  if (extension === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (
    extension === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx'
  }
  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)
  ) {
    return 'image'
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) return 'audio'
  return 'text'
}

async function preparePreview() {
  const version = ++previewVersion
  docxHtml.value = ''
  pluginError.value = ''
  mode.value = detectMode()
  if (!props.open || mode.value !== 'docx' || !fileUrl.value) return

  pluginLoading.value = true
  try {
    const [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([
      import('mammoth'),
      import('dompurify'),
    ])
    const response = await fetch(fileUrl.value, { credentials: 'include' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const result = await mammoth.convertToHtml({ arrayBuffer: await response.arrayBuffer() })
    if (version !== previewVersion) return
    docxHtml.value = DOMPurify.sanitize(result.value, {
      USE_PROFILES: { html: true },
    })
    if (!docxHtml.value.trim()) pluginError.value = '文档没有可显示的正文，已保留 RAG 文本预览。'
  } catch {
    if (version === previewVersion) pluginError.value = 'DOCX 插件加载失败，已切换为 RAG 文本预览。'
  } finally {
    if (version === previewVersion) pluginLoading.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (props.open && event.key === 'Escape') emit('close')
}

watch(
  () => [props.open, material.value?.id],
  () => void preparePreview(),
  { immediate: true },
)
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="open" class="hs-modal-backdrop" @mousedown.self="emit('close')">
    <section
      class="hs-source-modal hs-file-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="material-preview-title"
    >
      <button class="hs-modal-close" type="button" aria-label="关闭预览" @click="emit('close')">
        <X :size="18" />
      </button>
      <p class="hs-kicker"><FileText :size="15" />资料预览</p>
      <h2 id="material-preview-title">{{ material?.fileName || '正在读取资料' }}</h2>

      <p v-if="loading">正在加载资料信息…</p>
      <p v-else-if="source?.error" class="hs-form-error">{{ source.error }}</p>
      <div v-else-if="material" class="hs-file-preview-body">
        <iframe
          v-if="mode === 'pdf'"
          class="hs-pdf-preview"
          :src="fileUrl"
          :title="`${material.fileName} PDF 预览`"
        ></iframe>
        <template v-else-if="mode === 'docx'">
          <p v-if="pluginLoading">DOCX 预览插件正在解析文档…</p>
          <article v-else-if="docxHtml" class="hs-docx-preview" v-html="docxHtml"></article>
          <blockquote v-else>{{ source?.text }}</blockquote>
        </template>
        <img
          v-else-if="mode === 'image'"
          class="hs-native-image-preview"
          :src="fileUrl"
          :alt="material.fileName"
        />
        <audio
          v-else-if="mode === 'audio'"
          class="hs-audio-preview"
          :src="fileUrl"
          controls
        ></audio>
        <blockquote v-else>{{ source?.text }}</blockquote>
        <p v-if="pluginError" class="hs-preview-plugin-note">{{ pluginError }}</p>
      </div>

      <div v-if="material" class="hs-source-modal-meta">
        <span>第 {{ Number(source?.chunkIndex || 0) + 1 }} 段</span>
        <span>{{ material.subject }}</span>
        <span>{{ material.grade }}</span>
        <span>{{ material.year || '年份未标注' }}</span>
      </div>
      <footer v-if="material" class="hs-preview-actions">
        <a :href="fileUrl" target="_blank" rel="noopener">
          <ExternalLink :size="16" />在新窗口打开
        </a>
        <a :href="downloadUrl"><Download :size="16" />下载完整资料</a>
      </footer>
    </section>
  </div>
</template>
