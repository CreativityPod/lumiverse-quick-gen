import { afterEach, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { setup } from '../src/frontend'
import { emptyStep } from '../src/model'

let cleanup: (() => void) | undefined
afterEach(() => { cleanup?.(); cleanup = undefined })
async function harness({ available = false, source = 'none', selectedSource = null as any } = {}) {
  const dom = new JSDOM('<div id="root"></div>')
  Object.assign(globalThis, { document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement })
  const root = document.getElementById('root')!
  const events = new Map<string, Set<(payload: any) => void>>()
  const emitted: any[] = [], requests: any[] = []
  const emit = (name: string, payload: any) => {
    emitted.push({ name, payload })
    for (const callback of [...(events.get(name) ?? [])]) callback(payload)
  }
  const availability = (value: boolean) => emit('image_browser:picker:availability', { version: 1, provider: 'image_browser', available: value })
  let receive: (message: any) => void = () => {}
  let chatId: string | null = 'chat'
  let rejectSource = false
  const settings = { kind: 'image', outputTarget: 'preview', step: { ...emptyStep('image'), source } }
  const workflow = { id: 'wf', name: 'Source workflow', config: { workflow_api_json: { '1': { class_type: 'LoadImage', inputs: { image: '' } } }, field_mappings: [{ nodeId: '1', fieldName: 'image', mappedAs: 'init_image' }] } }
  const ctx = {
    ui: { registerDrawerTab: () => ({ root, setBadge() {}, destroy() {} }), registerInputBarAction: () => ({ onClick: () => () => {}, destroy() {} }) },
    dom: { addStyle: () => () => {} },
    events: {
      on(name: string, callback: (payload: any) => void) {
        if (!events.has(name)) events.set(name, new Set())
        events.get(name)!.add(callback)
        return () => { events.get(name)!.delete(callback) }
      },
      emit(name: string, payload: any) {
        emit(name, payload)
        if (name === 'image_browser:picker:probe' && available) availability(true)
        if (name === 'image_browser:picker:request') emit('image_browser:picker:result', { ...payload, provider: 'image_browser', status: 'opened' })
      },
    },
    getActiveChat: () => ({ chatId }),
    onBackendMessage(callback: typeof receive) { receive = callback; return () => {} },
    sendToBackend(request: any) {
      requests.push(request)
      queueMicrotask(() => {
        const result = request.type === 'qg_bootstrap' ? { supported: true, settings, selectedSource, assets: [{ id: 'generated', original_filename: 'image-gen-example.png' }], job: null,
          catalog: { connections: [{ id: 'comfy', name: 'ComfyUI', provider: 'comfyui', metadata: { comfyui_workflows: [workflow] } }], presets: [] } }
          : request.type === 'qg_save' ? request.selection
          : { id: request.imageId, original_filename: 'upload.png', mime_type: 'image/png' }
        receive({ requestId: request.requestId, ok: !(request.type === 'qg_source_image' && rejectSource), result, error: 'Image unavailable' })
      })
    },
  } as unknown as SpindleFrontendContext
  const teardown = setup(ctx)
  cleanup = () => { teardown(); dom.window.close() }
  await Bun.sleep(1)
  const button = () => [...root.querySelectorAll('button')].find((node) => node.textContent === 'Image Browser')!
  const sourceSelect = () => [...root.querySelectorAll('label')].find((node) => node.textContent?.startsWith('Source image override'))!.querySelector('select')!
  return { root, emitted, requests, emit, availability, button, sourceSelect,
    rejectSource() { rejectSource = true },
    switchChat() { chatId = 'other'; emit('CHAT_SWITCHED', {}) },
    result(status: string, extra: any = {}) {
      const request = emitted.filter((event) => event.name === 'image_browser:picker:request').at(-1)!.payload
      emit('image_browser:picker:result', { ...request, provider: 'image_browser', status, ...extra })
    },
  }
}

test('Image Browser button explains missing dependency and follows availability changes', async () => {
  const h = await harness()
  expect(h.button().disabled).toBe(true)
  expect(h.root.textContent).toContain('Image Browser extension v0.1.9')
  h.availability(true); expect(h.button().disabled).toBe(false)
  h.availability(false); expect(h.button().disabled).toBe(true)
  h.availability(true)
  h.emit('SPINDLE_EXTENSION_UNLOADED', { identifier: 'image_browser' })
  expect(h.button().disabled).toBe(true)
})

test('picker accepts one authenticated image, shows its filename, and ignores duplicate results', async () => {
  const h = await harness({ available: true })
  h.button().click(); await Bun.sleep(1)
  expect(h.button().disabled).toBe(true)
  h.result('selected', { imageId: 'upload' }); await Bun.sleep(1)
  expect(h.sourceSelect().value).toBe('upload')
  expect(h.sourceSelect().selectedOptions[0]!.textContent).toBe('Selected image: upload.png')
  expect(h.requests.filter((request) => request.type === 'qg_source_image')).toHaveLength(1)
  h.result('selected', { imageId: 'duplicate' }); await Bun.sleep(1)
  expect(h.sourceSelect().value).toBe('upload')
  expect(h.button().disabled).toBe(false)
})

test('reopening the picker sends the current source ID, including a newly selected upload', async () => {
  const h = await harness({ available: true, source: 'generated' })
  const lastRequest = () => h.emitted.filter((event) => event.name === 'image_browser:picker:request').at(-1)!.payload
  h.button().click(); await Bun.sleep(1)
  expect(lastRequest().selectedImageId).toBe('generated')
  h.result('selected', { imageId: 'upload' }); await Bun.sleep(1)
  h.button().click(); await Bun.sleep(1)
  expect(lastRequest().selectedImageId).toBe('upload')
  h.result('cancelled'); await Bun.sleep(1)
  const source = h.sourceSelect()
  source.value = 'generated'
  source.dispatchEvent(new document.defaultView!.Event('change'))
  h.button().click(); await Bun.sleep(1)
  expect(lastRequest().selectedImageId).toBe('generated')
})

test.each(['none', 'last'])('source option %s opens a fresh picker without an image anchor', async (source) => {
  const h = await harness({ available: true, source })
  h.button().click(); await Bun.sleep(1)
  const request = h.emitted.filter((event) => event.name === 'image_browser:picker:request').at(-1)!.payload
  expect(request.selectedImageId).toBeUndefined()
})

test.each(['cancelled', 'wrong-request', 'chat-changed', 'unavailable'] as const)('picker preserves source after %s', async (scenario) => {
  const h = await harness({ available: true, source: 'generated' })
  h.button().click(); await Bun.sleep(1)
  if (scenario === 'cancelled') h.result('cancelled')
  else {
    if (scenario === 'chat-changed') h.switchChat()
    if (scenario === 'unavailable') h.rejectSource()
    h.result('selected', { imageId: 'upload', ...(scenario === 'wrong-request' ? { requestId: 'unrelated' } : {}) })
  }
  await Bun.sleep(1)
  expect(h.sourceSelect().value).toBe('generated')
  if (scenario === 'chat-changed') expect(h.emitted.some((event) => event.name === 'image_browser:picker:cancel')).toBe(true)
})

test('restored source from outside the generated list keeps its filename', async () => {
  const h = await harness({ source: 'upload', selectedSource: { id: 'upload', original_filename: 'portrait.png' } })
  expect(h.sourceSelect().value).toBe('upload')
  expect(h.sourceSelect().selectedOptions[0]!.textContent).toBe('Selected image: portrait.png')
})
