import { afterEach, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { setup } from '../src/frontend'
import { emptyStep, type Catalog, type Job, type MediaKind, type OutputTarget, type Settings } from '../src/model'

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

test.each(['image', 'video'] as const)('starting %s clears old prompts until the current result completes', async (kind) => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement })
  const root = document.getElementById('root')!
  const settings: Settings = { kind, outputTarget: 'preview', step: emptyStep(kind) }
  const old: Job = { id: 'old', chatId: 'chat', mode: kind, phase: kind, status: 'complete', recipeName: 'Comfy', startedAt: 1,
    image: { imageId: 'image', mediaType: 'image', mimeType: 'image/png', mediaUrl: '/image', prompt: 'old image prompt' },
    video: { imageId: 'video', mediaType: 'video', mimeType: 'video/mp4', mediaUrl: '/video', prompt: 'old video prompt' },
  }
  const running: Job = { id: 'new', chatId: 'chat', mode: kind, phase: kind, status: 'running', recipeName: 'Comfy', startedAt: 2, image: kind === 'video' ? old.image : undefined }
  let onMessage: (message: unknown) => void = () => {}
  let releaseSave: () => void = () => {}
  const ctx = {
    ui: { registerDrawerTab: () => ({ root, setBadge: () => {}, activate: () => {}, destroy: () => {} }), registerInputBarAction: () => ({ onClick: () => () => {}, destroy: () => {} }) },
    dom: { addStyle: () => () => {} }, events: { on: () => () => {} },
    getActiveChat: () => ({ chatId: 'chat', characterId: 'char' }),
    onBackendMessage: (callback: typeof onMessage) => { onMessage = callback; return () => {} },
    sendToBackend: (request: any) => {
      if (request.type === 'qg_save') { releaseSave = () => onMessage({ requestId: request.requestId, ok: true, result: request.selection }); return }
      queueMicrotask(() => {
        if (request.type === 'qg_start') {
          // The progress update can arrive before a stale start-response snapshot.
          onMessage({ type: 'qg_job', job: { ...running, progress: { step: 1, totalSteps: 20 } } })
          onMessage({ requestId: request.requestId, ok: true, result: running })
        } else onMessage({ requestId: request.requestId, ok: true, result: { supported: true, settings, assets: [], job: old,
          catalog: { activeId: null, activeConnectionId: null, presets: [], connections: [{ id: 'conn', name: 'Comfy', provider: 'comfyui', metadata: {} }] } } })
      })
    },
  } as unknown as SpindleFrontendContext
  teardown = setup(ctx); await Bun.sleep(1)
  expect(root.textContent).toContain('old image prompt')
  expect(root.textContent).toContain('old video prompt')
  ;[...root.querySelectorAll('button')].find((button) => button.textContent === `Generate ${kind}`)!.click()
  await Bun.sleep(1)
  expect(root.textContent).not.toContain('old image prompt')
  expect(root.textContent).not.toContain('old video prompt')
  expect(root.querySelector('.qg-results details')).toBeNull()
  releaseSave(); await Bun.sleep(1)
  expect(root.querySelector('progress')?.value).toBe(1)
  expect(root.querySelector('.qg-results details')).toBeNull()
  expect(root.querySelector(kind === 'image' ? 'img' : 'video')).toBeNull()
  onMessage({ type: 'qg_job', job: { ...running, progress: { step: 2, totalSteps: 20 } } })
  expect(root.querySelector('.qg-results details')).toBeNull()
  const result = { imageId: 'new-result', mediaType: kind, mimeType: `${kind}/${kind === 'image' ? 'png' : 'mp4'}`, mediaUrl: '/new-result', prompt: `latest ${kind} prompt` }
  onMessage({ type: 'qg_job', job: { ...running, status: 'complete', [kind]: result } })
  expect(root.querySelector(kind === 'image' ? 'img' : 'video')!.closest('figure')!.textContent).toContain(result.prompt)
})

test.each((['image', 'video'] as const).flatMap((kind) =>
  ([undefined, 'chat_attachment', 'attach_to_message'] as const).map((postedTarget) => ({ kind, postedTarget })),
))('unavailable results hide broken media and actions, preserving posting status: %j', async ({ kind, postedTarget }: { kind: MediaKind; postedTarget: Exclude<OutputTarget, 'preview'> | undefined }) => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement })
  const root = document.getElementById('root')!
  const settings: Settings = { kind, outputTarget: 'preview', step: emptyStep(kind) }
  const job: Job = { id: 'job', chatId: 'chat', mode: kind, phase: kind, status: 'complete', recipeName: 'Comfy', startedAt: 1,
    image: { imageId: 'image', mediaType: 'image', mimeType: 'image/png', mediaUrl: '/api/v1/images/image', prompt: 'image prompt' },
    video: { imageId: 'video', mediaType: 'video', mimeType: 'video/mp4', mediaUrl: '/api/v1/images/video', prompt: 'video prompt' },
  }
  const result = job[kind]!
  if (postedTarget) { result.chatMessageId = 'posted'; result.chatOutputTarget = postedTarget }
  let onMessage: (message: unknown) => void = () => {}
  const ctx = {
    ui: { registerDrawerTab: () => ({ root, setBadge: () => {}, activate: () => {}, destroy: () => {} }), registerInputBarAction: () => ({ onClick: () => () => {}, destroy: () => {} }) },
    dom: { addStyle: () => () => {} }, events: { on: () => () => {} },
    getActiveChat: () => ({ chatId: 'chat', characterId: 'char' }),
    onBackendMessage: (callback: typeof onMessage) => { onMessage = callback; return () => {} },
    sendToBackend: (request: any) => {
      const result = request.type === 'qg_save' ? request.selection : { supported: true, settings, assets: [], job, catalog: { activeId: null, activeConnectionId: null, presets: [], connections: [] } }
      queueMicrotask(() => onMessage({ requestId: request.requestId, ok: true, result }))
    },
  } as unknown as SpindleFrontendContext
  teardown = setup(ctx); await Bun.sleep(1)
  const selector = kind === 'image' ? 'img' : 'video'
  const otherSelector = kind === 'image' ? 'video' : 'img'
  const media = root.querySelector(selector)!
  const figure = media.closest('figure')!
  expect(figure.querySelector('a')?.textContent).toBe(`Open ${kind}`)
  expect(figure.querySelectorAll('button')).toHaveLength(!postedTarget && kind === 'image' ? 2 : 0)

  media.dispatchEvent(new dom.window.Event('error'))
  expect(figure.querySelector(selector)).toBeNull()
  expect(figure.querySelector('.qg-media-unavailable')?.textContent).toBe(`${kind === 'image' ? 'Image' : 'Video'} unavailable.`)
  expect(figure.querySelectorAll('a, button')).toHaveLength(0)
  expect(figure.textContent).not.toContain(result.prompt)
  expect(figure.querySelector('details')).toBeNull()
  expect(figure.querySelector('.qg-result-posted')?.textContent).toBe(postedTarget ? postedTarget === 'attach_to_message' ? 'Attached to message' : 'Inserted into chat' : undefined)
  expect(root.querySelector(otherSelector)).not.toBeNull()
  expect(root.querySelector(otherSelector)!.closest('figure')!.querySelector('a')).not.toBeNull()

  // Progress/status updates must not bring back a preview that already failed.
  onMessage({ type: 'qg_job', job })
  expect(root.querySelector(selector)).toBeNull()
  expect(root.querySelector('.qg-media-unavailable')!.closest('figure')!.querySelector('details')).toBeNull()
  expect(root.querySelector(otherSelector)).not.toBeNull()

  // Explicit refresh retries a transient load failure.
  ;[...root.querySelectorAll('button')].find((button) => button.textContent === 'Refresh')!.click()
  await Bun.sleep(5)
  expect(root.querySelector(selector)?.getAttribute('src')).toBe(result.mediaUrl)
  expect(root.querySelector(selector)!.closest('figure')!.querySelector('a')).not.toBeNull()
  expect(root.querySelector(selector)!.closest('figure')!.querySelectorAll('button')).toHaveLength(!postedTarget && kind === 'image' ? 2 : 0)

  // An empty URL must not render a broken player or link to the current page.
  result.mediaUrl = ''
  onMessage({ type: 'qg_job', job })
  expect(root.querySelector(selector)).toBeNull()
  expect(root.querySelector('.qg-media-unavailable')!.closest('figure')!.querySelectorAll('a, button')).toHaveLength(0)
})

test.each([{ granted: true, target: 'chat_attachment' }, { granted: false, target: 'chat_attachment' }, { granted: true, target: 'attach_to_message' }, { granted: false, target: 'attach_to_message' }])('output selection and result actions respect permission: %j', async ({ granted, target }) => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
  Object.assign(globalThis, { document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement })
  const root = document.getElementById('root')!
  const requests: any[] = []
  const permissions: string[][] = []
  const postingSnapshots: Array<{ status: string | null; buttons: number }> = []
  let activeChat = 'original'
  let onMessage: (message: unknown) => void = () => {}
  let saved: Settings = { kind: 'image', outputTarget: 'preview', step: { ...emptyStep('image'), connectionId: 'conn', workflowId: 'wf' } }
  const job: Job = { id: 'finished', chatId: 'original', mode: 'image', phase: 'image', status: 'complete', recipeName: 'Comfy', startedAt: 1,
    image: { imageId: 'asset', chatId: 'original', mediaType: 'image', mimeType: 'image/png', mediaUrl: '/api/v1/images/asset', prompt: 'resolved' },
  }
  const ctx = {
    ui: { registerDrawerTab: () => ({ root, setBadge: () => {}, activate: () => {}, destroy: () => {} }), registerInputBarAction: () => ({ onClick: () => () => {}, destroy: () => {} }) },
    dom: { addStyle: () => () => {} }, events: { on: () => () => {} },
    permissions: { getGranted: async () => [], request: async (requested: string[]) => { permissions.push(requested); return granted ? requested : [] } },
    getActiveChat: () => ({ chatId: activeChat, characterId: 'char' }),
    onBackendMessage: (callback: typeof onMessage) => { onMessage = callback; return () => {} },
    sendToBackend: (request: any) => {
      requests.push(request)
      if (request.type === 'qg_insert') postingSnapshots.push({ status: root.querySelector('.qg-result-posting')?.textContent ?? null, buttons: root.querySelectorAll('.qg-post-actions button').length })
      if (request.type === 'qg_save') saved = request.selection
      const result = request.type === 'qg_bootstrap' ? { supported: true, settings: saved, assets: [], job: null,
        catalog: { activeId: null, presets: [], connections: [{ id: 'conn', name: 'Comfy', provider: 'comfyui', metadata: {} }] } }
        : request.type === 'qg_save' ? saved
        : request.type === 'qg_insert' ? { ...job, image: { ...job.image, chatMessageId: 'posted', chatOutputTarget: request.outputTarget } } : job
      queueMicrotask(() => onMessage({ requestId: request.requestId, ok: true, result }))
    },
  } as unknown as SpindleFrontendContext
  teardown = setup(ctx); await Bun.sleep(1)
  const output = [...root.querySelectorAll('label')].find((label) => label.querySelector('span')?.textContent === 'Output')!.querySelector('select')!
  expect([...output.options].map((option) => option.textContent)).toEqual(['Insert into chat', 'Attach to last message', 'Preview only'])
  expect(output.value).toBe('preview')
  output.value = target; output.dispatchEvent(new dom.window.Event('change'))
  ;[...root.querySelectorAll('button')].find((button) => button.textContent === 'Generate image')!.click()
  await Bun.sleep(5)
  expect(permissions).toEqual([['chat_mutation']])
  if (granted) {
    expect(requests.find((request) => request.type === 'qg_start').selection.outputTarget).toBe(target)
    expect(saved.outputTarget).toBe(target)
  } else expect(requests.some((request) => request.type === 'qg_start')).toBe(false)

  activeChat = 'another-chat'; onMessage({ type: 'qg_job', job })
  expect(root.textContent).toContain('Inserts into the original chat.')
  const insert = [...root.querySelectorAll('button')].find((button) => button.textContent === (target === 'attach_to_message' ? 'Attach to last message' : 'Insert into chat'))!
  insert.click(); insert.click(); await Bun.sleep(5)
  const inserts = requests.filter((request) => request.type === 'qg_insert')
  expect(inserts).toHaveLength(granted ? 1 : 0)
  if (granted) {
    expect(inserts[0]).toMatchObject({ jobId: 'finished', kind: 'image', outputTarget: target })
    expect(inserts[0].chatId).toBeUndefined()
    expect(postingSnapshots).toEqual([{ status: 'Posting…', buttons: 0 }])
    expect(root.querySelector('.qg-result-posted')?.textContent).toBe(target === 'attach_to_message' ? 'Attached to message' : 'Inserted into chat')
    expect(root.querySelector('.qg-post-actions')).toBeNull()
    expect(root.textContent).not.toContain('Inserts into the original chat.')
  } else expect(root.textContent).toContain('Chat Mutation')
})
