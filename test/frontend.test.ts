import { afterEach, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { setup } from '../src/frontend'
import { emptyStep, type Catalog, type Job } from '../src/model'

let teardown: (() => void) | undefined
let dom: JSDOM | undefined
afterEach(() => { teardown?.(); dom?.window.close() })
test.each([{ dropdown: true, initial: true, custom: true }, { dropdown: false, initial: true, custom: true }, { dropdown: false, initial: false, custom: true }, { dropdown: false, initial: true, custom: false }, { dropdown: false, initial: false, custom: false }])('workflow image controls follow mappings: %j', async ({ dropdown, initial, custom }) => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement })
  const root = document.getElementById('root')!
  const settings = { kind: 'video', step: { ...emptyStep('video'), source: initial ? 'none' : 'stale-asset' } }
  const catalog: Catalog = {
    activeId: 'main', activeConnectionId: 'comfy', presets: [{ id: 'main', name: 'Main preset', mode: 'custom' }],
    connections: [{ id: 'comfy', name: 'Local ComfyUI', provider: 'comfyui', metadata: { comfyui_workflows: [{ id: 'wf', name: 'Saved workflow', config: {
      workflow_api_json: { '1': { class_type: 'Video', inputs: { frames: 81, quality: 'fast' } }, '2': { class_type: 'LoadImage', _meta: { title: dropdown ? 'LoadImage' : 'Load Image (Path)' }, inputs: { image: 'old.png' } } },
      field_mappings: [{ nodeId: '1', fieldName: 'frames', mappedAs: 'custom' }, { nodeId: '1', fieldName: 'quality', mappedAs: 'custom' }, ...(custom ? [{ nodeId: '2', fieldName: 'image', mappedAs: 'custom' }] : []), ...(initial ? [{ nodeId: '2', fieldName: 'image', mappedAs: 'init_image' }] : [])], field_options: { '1:quality': ['fast', 'high'], '2:image': dropdown ? ['old.png', 'new.png'] : [] },
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
        const result = request.type === 'qg_bootstrap' ? { supported: true, catalog, assets: [], settings, job: null }
          : request.type === 'qg_save' ? request.selection
          : { id: 'job', chatId: 'chat', phase: 'image', status: 'running', recipeName: 'ComfyUI', mode: 'video', startedAt: Date.now() }
        onMessage({ requestId: request.requestId, ok: true, result })
      })
    },
  } as unknown as SpindleFrontendContext
  teardown = setup(ctx)
  await Bun.sleep(1)
  expect(root.textContent).toContain(`Workflow fields · ${custom ? 3 : 2}`)
  expect(root.querySelectorAll('.qg-step')).toHaveLength(1)
  expect([...root.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Refresh', 'Generate video'])
  const imageLabels = [...root.querySelectorAll('label')].filter((label) => label.textContent?.startsWith('image ·'))
  expect(imageLabels).toHaveLength(custom ? 1 : 0)
  if (custom) {
    const loadImage = imageLabels[0]!.querySelector<HTMLInputElement | HTMLSelectElement>(dropdown ? 'select' : 'input')!
    expect(loadImage.disabled).toBe(false)
    if (dropdown) expect([...(loadImage as HTMLSelectElement).options].map((option) => option.value)).toEqual(['old.png', 'new.png'])
    loadImage.value = dropdown ? 'new.png' : '/new/image.png'
    loadImage.dispatchEvent(new dom.window.Event('change'))
  }
  const sourceLabel = [...root.querySelectorAll('label')].find((label) => label.textContent?.startsWith('Source image override'))
  expect(!!sourceLabel).toBe(initial)
  if (initial) {
    const source = sourceLabel!.querySelector('select')!
    source.value = 'last'; source.dispatchEvent(new dom.window.Event('change'))
    if (custom) {
      const overridden = [...root.querySelectorAll('label')].find((label) => label.textContent?.startsWith('image ·'))!.querySelector<HTMLInputElement | HTMLSelectElement>(dropdown ? 'select' : 'input')!
      expect(overridden.disabled).toBe(true)
    }
    const resetSource = [...root.querySelectorAll('label')].find((label) => label.textContent?.startsWith('Source image override'))!.querySelector('select')!
    resetSource.value = 'none'; resetSource.dispatchEvent(new dom.window.Event('change'))
  }
  const frames = [...root.querySelectorAll('label')].find((label) => label.textContent?.startsWith('frames'))!.querySelector('input')!
  frames.value = '121'; frames.dispatchEvent(new dom.window.Event('change'))
  ;[...root.querySelectorAll('button')].find((button) => button.textContent === 'Generate video')!.click()
  await Bun.sleep(1)
  const start = requests.find((request) => request.type === 'qg_start')
  expect(start.selection.kind).toBe('video')
  expect(start.selection.step.source).toBe('none')
  expect(start.selection.step.fields['2:image']).toBe(custom ? (dropdown ? 'new.png' : '/new/image.png') : undefined)
  expect(start.chatId).toBe('chat')
  expect(start.selection.step.fields['1:frames']).toBe(121)
  expect(start.selection.step.connectionId).toBe('comfy')
  const job: Job = { id: 'job', chatId: 'chat', phase: 'video', status: 'complete', recipeName: 'ComfyUI', mode: 'video', startedAt: 1,
    image: { imageId: 'image', mediaType: 'image', mimeType: 'image/png', mediaUrl: '/api/v1/images/image', prompt: '<script>no</script>' },
    video: { imageId: 'video', mediaType: 'video', mimeType: 'video/mp4', mediaUrl: '/api/v1/images/video', prompt: 'motion' },
  }
  onMessage({ type: 'qg_job', job })
  expect(root.querySelector('video')?.getAttribute('src')).toBe('/api/v1/images/video')
  expect(root.querySelector('video')?.controls).toBe(true)
  expect(root.querySelector('img')?.getAttribute('src')).toBe('/api/v1/images/image')
  expect(root.querySelector('script')).toBeNull()
})
