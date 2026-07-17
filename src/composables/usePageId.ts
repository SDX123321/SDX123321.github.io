/**
 * usePageId — 替代 React 的 hooks/usePageId.js
 * 从 Vue Router 路由参数中获取当前课程 ID。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

export function usePageId() {
  const route = useRoute()
  return computed(() => (route.params['courseId'] as string) || null)
}
