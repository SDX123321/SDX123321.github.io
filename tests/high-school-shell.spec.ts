import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HighSchoolShell from '../src/components/HighSchoolShell.vue'

describe('HighSchoolShell', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )
  })

  it('exposes the public semantic navigation destinations and edition switch', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/high-school', component: { template: '<div />' } },
        { path: '/', component: { template: '<div />' } },
      ],
    })
    await router.push('/high-school')
    await router.isReady()
    const wrapper = mount(HighSchoolShell, {
      global: { plugins: [router], stubs: { RouterView: true } },
    })
    const hrefs = wrapper.findAll('nav a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual([
      '/high-school',
      '/high-school/resources',
      '/high-school/assistant',
      '/high-school/practice',
      '/high-school/knowledge-graph/math',
    ])
    expect(wrapper.get('.hs-edition').attributes('href')).toBe('/')
    expect(wrapper.get('.hs-menu-button').attributes('aria-expanded')).toBe('false')
  })
})
