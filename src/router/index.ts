import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, top: 92, behavior: 'smooth' }
    return { top: 0 }
  },
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/courses/gaokao/:subject?',
      name: 'gaokao',
      component: () => import('../views/GaokaoView.vue'),
    },
    {
      path: '/courses/:courseId',
      name: 'course',
      component: () => import('../views/CourseView.vue'),
    },
    {
      path: '/courses/:courseId/:section(.*)*',
      name: 'course-section',
      component: () => import('../views/CourseView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
    },
  ],
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '期末复习笔记'
  document.title = title
})

export default router
