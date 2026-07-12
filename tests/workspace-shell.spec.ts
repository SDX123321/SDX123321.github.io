import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceShell from '../src/components/WorkspaceShell.vue'

describe('WorkspaceShell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/domains')) return new Response(JSON.stringify({ domains: [
        { id: '1', key: 'high-school', name: '高中' }, { id: '2', key: 'university', name: '大学' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } })
      return new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } })
    }))
  })

  it('shares one navigation model across both content domains', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/workspace/:domain', component: WorkspaceShell, children: [{ path: '', component: { template: '<div />' } }] },
      { path: '/high-school/settings', component: { template: '<div />' } },
    ] })
    await router.push('/workspace/university'); await router.isReady()
    const wrapper = mount(WorkspaceShell, { global: { plugins: [router], stubs: { RouterView: true } } })
    await vi.waitFor(() => expect(wrapper.findAll('.domain-switch option')).toHaveLength(2))
    expect(wrapper.findAll('nav a').map(a => a.attributes('href'))).toEqual([
      '/workspace/university', '/workspace/university/graph', '/workspace/university?focus=materials',
    ])
  })
})
