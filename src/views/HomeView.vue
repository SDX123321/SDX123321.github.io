<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ArrowRight,
  BookOpenCheck,
  Clock3,
  Command,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-vue-next'
import CourseIcon from '../components/CourseIcon.vue'
import ResourceShelf from '../features/resources/ResourceShelf.vue'
import { courses } from '../data/courses'

const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const recentCourseId = ref<string | null>(null)

const filteredCourses = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase('zh-CN')
  if (!keyword) return courses
  return courses.filter((course) =>
    [course.name, course.shortName, course.description, ...course.tags]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(keyword),
  )
})

const recentCourse = computed(() => courses.find((course) => course.id === recentCourseId.value))

onMounted(() => {
  recentCourseId.value = localStorage.getItem('review_recent_course')
  window.addEventListener('keydown', handleShortcut)
})

onBeforeUnmount(() => window.removeEventListener('keydown', handleShortcut))

function handleShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchInput.value?.focus()
  }
}
</script>

<template>
  <div class="home-shell">
    <header class="topbar">
      <RouterLink class="brand" to="/" aria-label="期末复习笔记首页">
        <span class="brand-mark"><BookOpenCheck :size="20" aria-hidden="true" /></span>
        <span>期末复习笔记</span>
      </RouterLink>
      <nav class="topnav" aria-label="主导航">
        <a href="#courses">课程</a>
        <a href="#resources">资料</a>
        <a href="#method">复习方法</a>
        <a href="#about">关于</a>
      </nav>
      <div class="topbar-spacer" />
    </header>

    <main id="main-content">
      <section class="hero page-container">
        <div class="hero-copy">
          <p class="eyebrow"><Sparkles :size="15" />为考试周而生的学习空间</p>
          <h1>把复杂的知识，<br /><span>复习得更清楚。</span></h1>
          <p class="hero-lead">
            结构化笔记、真题练习与进度记录放在一个安静的空间里。少一点寻找，多一点真正的掌握。
          </p>

          <form class="hero-search" role="search" @submit.prevent>
            <Search :size="20" aria-hidden="true" />
            <label class="sr-only" for="course-search">搜索课程或知识点</label>
            <input
              id="course-search"
              ref="searchInput"
              v-model="query"
              type="search"
              placeholder="搜索课程、章节或知识点…"
              autocomplete="off"
            />
            <kbd><Command :size="12" />K</kbd>
          </form>

          <div class="hero-actions">
            <a class="primary-button" href="#courses">开始复习<ArrowRight :size="18" /></a>
            <RouterLink
              v-if="recentCourse"
              class="secondary-button"
              :to="`/courses/${recentCourse.id}`"
            >
              <Clock3 :size="17" />继续 {{ recentCourse.shortName }}
            </RouterLink>
          </div>
        </div>

        <div class="focus-panel" aria-label="学习概览">
          <div class="focus-orbit orbit-one" />
          <div class="focus-orbit orbit-two" />
          <div class="focus-card focus-card-main">
            <span class="focus-icon"><Target :size="22" /></span>
            <p>今日建议</p>
            <strong>25 分钟专注复习</strong>
            <div class="focus-progress"><span /></div>
            <small>从最近一次停下的位置继续</small>
          </div>
          <div class="focus-card focus-card-float">
            <TrendingUp :size="18" />
            <span
              ><strong>{{ courses.length }}</strong> 门课程</span
            >
          </div>
        </div>
      </section>

      <section id="courses" class="course-section page-container" aria-labelledby="courses-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">课程资料库</p>
            <h2 id="courses-title">选择今天要攻克的内容</h2>
          </div>
          <p>{{ filteredCourses.length }} 门课程</p>
        </div>

        <div v-if="filteredCourses.length" class="course-grid">
          <RouterLink
            v-for="(course, index) in filteredCourses"
            :key="course.id"
            class="course-card"
            :class="{ 'course-card-featured': course.featured }"
            :style="{
              '--course-accent': course.accent,
              '--course-soft': course.softAccent,
              '--delay': `${index * 35}ms`,
            }"
            :to="`/courses/${course.id}`"
          >
            <div class="course-card-top">
              <span class="course-icon"><CourseIcon :name="course.icon" :size="23" /></span>
              <ArrowRight class="course-arrow" :size="19" />
            </div>
            <div>
              <p class="course-kicker">{{ course.shortName }}</p>
              <h3>{{ course.name }}</h3>
            </div>
            <p>{{ course.description }}</p>
            <ul class="tag-list" aria-label="课程特点">
              <li v-for="tag in course.tags" :key="tag">{{ tag }}</li>
            </ul>
          </RouterLink>
        </div>
        <div v-else class="no-results">
          <Search :size="28" />
          <h3>没有找到“{{ query }}”</h3>
          <p>试试课程简称，例如“高数”或“DSP”。</p>
          <button type="button" @click="query = ''">清除搜索</button>
        </div>
      </section>

      <ResourceShelf />

      <section id="method" class="method-section page-container">
        <div class="section-heading">
          <div>
            <p class="eyebrow">更轻松的复习节奏</p>
            <h2>从读懂，到真正掌握</h2>
          </div>
        </div>
        <div class="method-grid">
          <article>
            <span>01</span><BookOpenCheck :size="24" />
            <h3>结构化阅读</h3>
            <p>用章节导航快速建立知识全貌，再深入重点。</p>
          </article>
          <article>
            <span>02</span><Target :size="24" />
            <h3>即时练习</h3>
            <p>读完马上做题，用反馈确认自己是否真的理解。</p>
          </article>
          <article>
            <span>03</span><TrendingUp :size="24" />
            <h3>持续复盘</h3>
            <p>记住进度和错题，让下一次复习从关键处开始。</p>
          </article>
        </div>
      </section>
    </main>

    <footer id="about" class="site-footer page-container">
      <span>期末复习笔记</span>
      <p>愿每一次认真复习，都能换来从容作答。</p>
    </footer>
  </div>
</template>
