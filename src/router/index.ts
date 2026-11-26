import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import type { CourseContent } from '../data/course-content'

declare module 'vue-router' {
  interface RouteMeta {
    course?: CourseContent
    courseLoadFailed?: boolean
    title?: string
  }
}

const loadCourseView = () => import('../views/CourseView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    const target = to.hash ? document.getElementById(to.hash.slice(1)) : null
    if (target) return { el: target, top: 92 }
    return { top: 0 }
  },
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/workspace/:domain(high-school|university)',
      component: () => import('../components/WorkspaceShell.vue'),
      children: [
        {
          path: '',
          name: 'workspace-home',
          component: () => import('../views/workspace/WorkspaceHomeView.vue'),
        },
        {
          path: 'graph/:subjectId?',
          name: 'workspace-graph',
          component: () => import('../views/workspace/WorkspaceGraphView.vue'),
        },
      ],
    },
    {
      path: '/high-school',
      component: () => import('../components/HighSchoolShell.vue'),
      children: [
        {
          path: '',
          name: 'high-school-home',
          component: () => import('../views/high-school/HighSchoolHomeView.vue'),
          meta: { title: '高中学习站' },
        },
        {
          path: 'resources',
          name: 'high-school-resources',
          component: () => import('../views/high-school/HighSchoolResourcesView.vue'),
          meta: { title: '资料库｜高中学习站' },
        },
        {
          path: 'assistant',
          name: 'high-school-assistant',
          component: () => import('../views/high-school/HighSchoolAssistantView.vue'),
          meta: { title: 'AI 助学｜高中学习站' },
        },
        {
          path: 'practice/:subject?',
          name: 'high-school-practice',
          component: () => import('../views/high-school/HighSchoolPracticeView.vue'),
          meta: { title: '真题练习｜高中学习站' },
        },
        {
          path: 'admin',
          name: 'high-school-admin',
          component: () => import('../views/high-school/HighSchoolAdminView.vue'),
          meta: { title: '管理后台｜高中学习站' },
        },
        {
          path: 'settings',
          name: 'high-school-settings',
          component: () => import('../views/high-school/HighSchoolSettingsView.vue'),
          meta: { title: '个人设置｜高中学习站' },
        },
        {
          path: 'knowledge-graph/:subject',
          name: 'high-school-knowledge-graph',
          component: () => import('../views/high-school/HighSchoolKnowledgeGraphView.vue'),
          meta: { title: '学科知识图谱｜高中学习站' },
        },
      ],
    },
    {
      path: '/courses/gaokao/:subject?',
      name: 'gaokao',
      redirect: (to) => ({
        name: 'high-school-practice',
        params: { subject: to.params.subject || undefined },
      }),
    },
    {
      path: '/courses/:courseId',
      name: 'course',
      component: loadCourseView,
      props: (route) => ({ course: route.meta.course, loadFailed: route.meta.courseLoadFailed }),
    },
    {
      path: '/courses/:courseId/:section(.*)*',
      name: 'course-section',
      component: loadCourseView,
      props: (route) => ({ course: route.meta.course, loadFailed: route.meta.courseLoadFailed }),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
})

router.beforeEach(async (to, from) => {
  if (to.name !== 'course' && to.name !== 'course-section') return
  const courseId = String(to.params.courseId)
  if (from.meta.course?.id === courseId) {
    to.meta.course = from.meta.course
    return
  }
  const result = import('../data/course-content')
    .then(({ loadCourseContent }) => loadCourseContent(courseId))
    .catch(() => {
      to.meta.courseLoadFailed = true
    })
  const [course] = await Promise.all([result, loadCourseView()])
  if (course) to.meta.course = course
})

router.afterEach((to) => {
  const title = to.meta.course
    ? `${to.meta.course.name}｜期末复习笔记`
    : (to.meta.title ?? '期末复习笔记')
  document.title = title
})

export default router
