import { afterEach, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { setup } from '../src/frontend'
import { newRecipe, type Catalog, type Job } from '../src/model'

let teardown: (() => void) | undefined
let dom: JSDOM | undefined
afterEach(() => { teardown?.(); dom?.window.close() })
test('drawer controls send an explicit recipe and show image/video assets without chat commands', async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement })
  const root = document.getElementById('root')!
  const recipe = newRecipe('r', 'Portrait and motion')
  const catalog: Catalog = {
    activeId: 'main', activeConnectionId: 'comfy', presets: [{ id: 'main', name: 'Main preset', mode: 'custom' }],
    connections: [{ id: 'comfy', name: 'Local ComfyUI', provider: 'comfyui', metadata: { comfyui_workflows: [{ id: 'wf', name: 'Saved workflow', config: {
      workflow_api_json: { '1': { class_type: 'Video', inputs: { frames: 81, quality: 'fast' } } },
      field_mappings: [{ nodeId: '1', fieldName: 'frames', mappedAs: 'custom' }, { nodeId: '1', fieldName: 'quality', mappedAs: 'custom' }], field_options: { '1:quality': ['fast', 'high'] },
    } }] } }],
  }
  const requests: any[] = []
  let onMessage: (message: unknown) => void = () => {}
  const ctx = {
    ui: { registerDrawerTab: () => ({ root, setBadge: () => {}, activate: () => {}, destroy: () => {} }), registerInputBarAction: () => ({ onClick: () => () => {}, destroy: () => {} }) },
    dom: { addStyle: () => () => {} }, events: { on: () => () => {} },
    getActiveChat: () => ({ chatId: 'chat', characterId: 'char' }),
    onBackendMessage: (callback: typeof onMessage) => { onMessage = callback; return () => {} },
    sendToBackend: (request: any) => {
      requests.push(request)
      queueMicrotask(() => {
        const result = request.type === 'qg_bootstrap' ? { supported: true, catalog, assets: [], settings: { recipes: [recipe], selectedId: 'r' }, job: null }
          : request.type === 'qg_save' ? { recipes: [request.recipe], selectedId: 'r' }
          : { id: 'job', chatId: 'chat', phase: 'image', status: 'running', recipeName: recipe.name, mode: 'sequence', startedAt: Date.now() }
        onMessage({ requestId: request.requestId, ok: true, result })
      })
    },
  } as unknown as SpindleFrontendContext
  teardown = setup(ctx)
  await Bun.sleep(1)
  expect(root.textContent).toContain('Workflow fields · 2')
  const frames = [...root.querySelectorAll('label')].find((label) => label.textContent?.startsWith('frames'))!.querySelector('input')!
  frames.value = '121'; frames.dispatchEvent(new dom.window.Event('change'))
  ;[...root.querySelectorAll('button')].find((button) => button.textContent === 'Run sequence')!.click()
  await Bun.sleep(1)
  const start = requests.find((request) => request.type === 'qg_start')
  expect(start.mode).toBe('sequence')
  expect(start.chatId).toBe('chat')
  expect(start.recipe.image.fields['1:frames']).toBe(121)
  expect(start.recipe.image.connectionId).toBe('comfy')
  const job: Job = { id: 'job', chatId: 'chat', phase: 'video', status: 'complete', recipeName: recipe.name, mode: 'sequence', startedAt: 1,
    image: { imageId: 'image', mediaType: 'image', mimeType: 'image/png', mediaUrl: '/api/v1/images/image', prompt: '<script>no</script>' },
    video: { imageId: 'video', mediaType: 'video', mimeType: 'video/mp4', mediaUrl: '/api/v1/images/video', prompt: 'motion' },
  }
  onMessage({ type: 'qg_job', job })
  expect(root.querySelector('video')?.getAttribute('src')).toBe('/api/v1/images/video')
  expect(root.querySelector('video')?.controls).toBe(true)
  expect(root.querySelector('img')?.getAttribute('src')).toBe('/api/v1/images/image')
  expect(root.querySelector('script')).toBeNull()
})
