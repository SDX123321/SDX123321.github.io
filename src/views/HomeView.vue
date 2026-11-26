<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Clock3,
  GraduationCap,
  LibraryBig,
  Search,
  Target,
  TrendingUp,
} from 'lucide-vue-next'
import CourseIcon from '../components/CourseIcon.vue'
import { courses } from '../data/courses'
import '../styles/home.css'

const universityCourses = courses.filter((course) => course.id !== 'gaokao')
const searchableCourses = universityCourses.map((course) => ({
  course,
  keywords: [course.name, course.shortName, course.description, ...course.tags]
    .join(' ')
    .toLocaleLowerCase('zh-CN'),
}))
const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const resultsHeading = ref<HTMLElement | null>(null)
const recentCourse = ref<(typeof courses)[number]>()
const resourcesSection = ref<HTMLElement | null>(null)
const resources = shallowRef<typeof import('../features/resources/ResourceShelf.vue').default>()
const resourcesLoading = ref(false)
const resourcesFailed = ref(false)
let resourceObserver: IntersectionObserver | undefined

const filteredCourses = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase('zh-CN')
  return keyword
    ? searchableCourses.filter((item) => item.keywords.includes(keyword)).map((item) => item.course)
    : universityCourses
})

async function loadResources() {
  if (resources.value || resourcesLoading.value) return
  resourceObserver?.disconnect()
  resourcesLoading.value = true
  resourcesFailed.value = false
  try {
    resources.value = (await import('../features/resources/ResourceShelf.vue')).default
  } catch {
    resourcesFailed.value = true
  } finally {
    resourcesLoading.value = false
  }
}

onMounted(() => {
  try {
    const recentId = localStorage.getItem('review_recent_course')
    recentCourse.value = universityCourses.find((course) => course.id === recentId)
  } catch {
    recentCourse.value = undefined
  }
  window.addEventListener('keydown', handleShortcut)
  if (!resourcesSection.value) return
  if ('IntersectionObserver' in window) {
    resourceObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadResources()
      },
      { rootMargin: '240px 0px' },
    )
    resourceObserver.observe(resourcesSection.value)
  } else {
    void loadResources()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  resourceObserver?.disconnect()
})

function handleShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
  }
}

function showResults() {
  resultsHeading.value?.focus({ preventScroll: true })
  resultsHeading.value?.scrollIntoView({ block: 'start' })
}

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

function selectHighSchool() {
  try {
    localStorage.setItem('review_edition', 'high-school')
  } catch {
    return
  }
}
</script>

<template>
  <div class="home-shell">
    <header class="home-header">
      <div class="page-container home-header-inner">
        <RouterLink class="home-brand" to="/" aria-label="期末复习笔记首页">
          <span class="home-brand-mark"><BookOpenCheck :size="20" aria-hidden="true" /></span>
          期末复习笔记
        </RouterLink>
        <nav class="home-navigation" aria-label="主导航">
          <a href="#courses">大学课程</a>
          <RouterLink to="/high-school" @click="selectHighSchool">高中学习站</RouterLink>
          <a href="#resources" @click="loadResources">复习资料</a>
        </nav>
      </div>
    </header>

    <main id="main-content" tabindex="-1">
      <section class="page-container home-intro" aria-labelledby="home-title">
        <div class="home-intro-copy">
          <h1 id="home-title">把知识复习<span>得更清楚。</span></h1>
          <p>大学课程笔记、江苏高考真题和复习资料，按科目整理。</p>
          <form class="home-search" role="search" @submit.prevent="showResults">
            <Search :size="20" aria-hidden="true" />
            <label class="sr-only" for="course-search">搜索大学课程</label>
            <input
              id="course-search"
              ref="searchInput"
              v-model="query"
              type="search"
              aria-controls="courses"
              placeholder="搜索大学课程，如高数、DSP"
              autocomplete="off"
            />
            <button type="submit">搜索</button>
          </form>
          <RouterLink v-if="recentCourse" class="home-continue" :to="`/courses/${recentCourse.id}`">
            <Clock3 :size="17" aria-hidden="true" />
            继续复习 {{ recentCourse.shortName }}
            <ArrowRight :size="16" aria-hidden="true" />
          </RouterLink>
          <a v-else class="home-continue" href="#courses">
            浏览大学课程 <ArrowDown :size="16" aria-hidden="true" />
          </a>
        </div>

        <nav class="study-index" aria-label="复习入口">
          <p class="study-index-title"><LibraryBig :size="17" aria-hidden="true" />复习索引</p>
          <a class="study-index-entry study-index-university" href="#courses">
            <span class="study-index-icon"><BookOpenCheck :size="23" aria-hidden="true" /></span>
            <span>
              <strong>大学期末</strong>
              <small>{{ universityCourses.length }} 门课程 · 笔记、公式与自测</small>
            </span>
            <ArrowDown :size="19" aria-hidden="true" />
          </a>
          <RouterLink
            class="study-index-entry study-index-high-school"
            to="/high-school"
            @click="selectHighSchool"
          >
            <span class="study-index-icon"><GraduationCap :size="23" aria-hidden="true" /></span>
            <span>
              <strong>高中备考</strong>
              <small>江苏高考真题 · 学科资料与练习</small>
            </span>
            <ArrowUpRight :size="19" aria-hidden="true" />
          </RouterLink>
        </nav>
      </section>

      <section id="courses" class="home-section page-container" aria-labelledby="courses-title">
        <div class="section-heading">
          <h2 id="courses-title" ref="resultsHeading" tabindex="-1">大学课程</h2>
          <p role="status">{{ query.trim() ? '找到 ' : '' }}{{ filteredCourses.length }} 门课程</p>
        </div>
        <div v-if="filteredCourses.length" class="home-course-grid">
          <RouterLink
            v-for="course in filteredCourses"
            :key="course.id"
            class="home-course-card"
            :style="{ '--course-accent': course.accent, '--course-soft': course.softAccent }"
            :to="`/courses/${course.id}`"
          >
            <div class="home-course-card-top">
              <span class="home-course-icon"><CourseIcon :name="course.icon" :size="22" /></span>
              <ArrowUpRight :size="18" aria-hidden="true" />
            </div>
            <h3>{{ course.name }}</h3>
            <p>{{ course.description }}</p>
            <ul class="home-course-tags" aria-label="课程内容">
              <li v-for="tag in course.tags" :key="tag">{{ tag }}</li>
            </ul>
          </RouterLink>
        </div>
        <div v-else class="no-results">
          <h3>没有找到“{{ query.trim() }}”</h3>
          <p>试试课程简称，例如“高数”或“DSP”。</p>
          <button type="button" @click="clearSearch">清除搜索</button>
        </div>
      </section>

      <section
        id="resources"
        ref="resourcesSection"
        class="home-section page-container"
        aria-labelledby="resources-title"
      >
        <div class="section-heading">
          <h2 id="resources-title">复习资料</h2>
        </div>
        <component :is="resources" v-if="resources" />
        <div v-else class="home-resource-placeholder" :aria-busy="resourcesLoading">
          <p v-if="resourcesFailed" role="status">资料目录加载失败。</p>
          <p v-else-if="resourcesLoading" role="status">正在加载资料目录…</p>
          <button v-else type="button" class="load-more" @click="loadResources">
            打开资料目录
          </button>
          <button v-if="resourcesFailed" type="button" class="load-more" @click="loadResources">
            重新加载
          </button>
        </div>
      </section>

      <section id="method" class="home-section page-container" aria-labelledby="method-title">
        <div class="section-heading"><h2 id="method-title">复习方法</h2></div>
        <ol class="home-method-grid">
          <li>
            <BookOpenCheck :size="20" aria-hidden="true" />
            <div>
              <h3>读笔记</h3>
              <p>先过一遍课程目录，再读不熟悉的章节。</p>
            </div>
          </li>
          <li>
            <Target :size="20" aria-hidden="true" />
            <div>
              <h3>做练习</h3>
              <p>读完一章就做几道题，检查能否独立解答。</p>
            </div>
          </li>
          <li>
            <TrendingUp :size="20" aria-hidden="true" />
            <div>
              <h3>回看错题</h3>
              <p>下次复习时，先重做错过的题。</p>
            </div>
          </li>
        </ol>
      </section>
    </main>

    <footer id="about" class="home-footer page-container">
      <strong>期末复习笔记</strong>
      <a href="#method">复习方法</a>
    </footer>
  </div>
</template>
