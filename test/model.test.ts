import { expect, test } from 'bun:test'
import { buildInput, fieldControls, migrateSettings, newRecipe, type Catalog, type Workflow } from '../src/model'
const workflow: Workflow = { id: 'w', name: 'Example', config: {
  workflow_api_json: {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: 'prompt' } },
    '2': { class_type: 'LoadImage', inputs: { image: 'default.png' } },
    '3': { class_type: 'Video', inputs: { length: 81, model: 'small', enabled: true } },
  },
  field_mappings: [
    { nodeId: '1', fieldName: 'text', mappedAs: 'positive_prompt' },
    { nodeId: '2', fieldName: 'image', mappedAs: 'init_image' },
    ...['length', 'model', 'enabled'].map((fieldName) => ({ nodeId: '3', fieldName, mappedAs: 'custom' })),
  ], field_options: { '2:image': ['default.png', 'portrait.png'], '3:model': ['small', 'large'] },
} }
const catalog: Catalog = { activeId: 'active', activeConnectionId: 'c', presets: [{ id: 'active', name: 'Main', mode: 'parsed_custom' }, { id: 'other', name: 'Motion', mode: 'custom' }], connections: [{ id: 'c', name: 'Comfy', provider: 'comfyui', metadata: { comfyui_workflows: [workflow] } }] }
function step() { return { ...newRecipe('r').video, connectionId: 'c', workflowId: 'w', source: 'last' } }
test('uses a selected preset and custom types without mutating defaults', () => {
  const before = JSON.stringify({ workflow, catalog })
  const input = buildInput({ ...step(), presetId: 'other', fields: { '3:length': 121, '3:enabled': false, '3:model': 'large' } }, 'video', catalog, { chatId: 'chat', jobId: 'job', sourceImageId: 'image' })
  expect(input.promptPresetId).toBe('other')
  expect(input.promptMode).toBe('custom')
  expect(input.parameters.comfyui_field_values).toEqual({ custom: { '3:length': 121, '3:model': 'large', '3:enabled': false }, node_fields: {} })
  expect(input.includeDataUrl).toBe(false)
  expect(JSON.stringify({ workflow, catalog })).toBe(before)
})
test('captures active preset as an explicit ID', () => {
  const input = buildInput(step(), 'video', catalog, { chatId: 'chat', jobId: 'job', sourceImageId: 'image' })
  expect(input.promptPresetId).toBe('active')
  expect(input.promptMode).toBe('parsed_custom')
})
test('keeps two sampler stages independent and respects native LoRA selection', () => {
  const staged = structuredClone(catalog)
  const config = (staged.connections[0]!.metadata.comfyui_workflows as Workflow[])[0]!.config
  Object.assign(config.workflow_api_json!, {
    '4': { class_type: 'KSampler', inputs: { steps: 20 } },
    '5': { class_type: 'KSampler', inputs: { steps: 8 } },
    '6': { class_type: 'LoraLoader', inputs: { lora_name: 'embedded.safetensors' } },
  })
  config.field_mappings.push({ nodeId: '4', fieldName: 'steps', mappedAs: 'steps' }, { nodeId: '5', fieldName: 'steps', mappedAs: 'steps' }, { nodeId: '6', fieldName: 'lora_name', mappedAs: 'lora_name' })
  const input = buildInput({ ...step(), bypassLoras: false, fields: { '4:steps': 24 } }, 'video', staged, { chatId: 'chat', jobId: 'job', sourceImageId: 'image' })
  expect(input.parameters.comfyui_field_values.node_fields).toEqual({ '4:steps': 24, '5:steps': 8 })
})
test('rejects missing presets, workflows, image sources and stale dropdown choices', () => {
  const context = { chatId: 'chat', jobId: 'job', sourceImageId: 'image' }
  expect(() => buildInput({ ...step(), presetId: 'deleted' }, 'video', catalog, context)).toThrow('Preset')
  expect(() => buildInput({ ...step(), workflowId: 'deleted' }, 'video', catalog, context)).toThrow('workflow')
  expect(() => buildInput(step(), 'video', catalog, { ...context, sourceImageId: undefined })).toThrow('source image')
  expect(() => buildInput({ ...step(), fields: { '3:model': 'missing' } }, 'video', catalog, context)).toThrow('available value')
})
test('custom controls expose typed defaults and stored choices', () => {
  expect(fieldControls(workflow).map(({ key, value, options }) => ({ key, value, options }))).toEqual([
    { key: '2:image', value: 'default.png', options: ['default.png', 'portrait.png'] },
    { key: '3:length', value: 81, options: [] }, { key: '3:model', value: 'small', options: ['small', 'large'] }, { key: '3:enabled', value: true, options: [] },
  ])
})
test('LoadImage choices use ComfyUI filenames and an explicit source overrides them', () => {
  const choice = { ...step(), source: 'none', fields: { '2:image': 'portrait.png' } }
  const input = buildInput(choice, 'video', catalog, { chatId: 'chat', jobId: 'job' })
  expect(input.parameters.comfyui_field_values.init_image).toBe('portrait.png')
  expect(input.source_image_id).toBeUndefined()
  const override = buildInput({ ...choice, source: 'last' }, 'video', catalog, { chatId: 'chat', jobId: 'job', sourceImageId: 'saved-image' })
  expect(override.parameters.comfyui_field_values.init_image).toBeUndefined()
  expect(override.source_image_id).toBe('saved-image')
})
test('migrates the selected legacy recipe without deleting its other steps or recipes', () => {
  const recipe = newRecipe('r')
  recipe.image.connectionId = 'image-connection'
  recipe.image.workflowId = 'image-workflow'
  recipe.video = { ...step(), presetId: 'other', fields: { '3:length': 121 } }
  const old = { recipes: [newRecipe('unused'), recipe], selectedId: 'r' }
  const before = JSON.stringify(old)
  const selection = migrateSettings(old)
  expect(selection.kind).toBe('video')
  expect(selection.step.fields['3:length']).toBe(121)
  expect(selection.step.presetId).toBe('other')
  expect(JSON.stringify(old)).toBe(before)
  expect(migrateSettings(null).step.source).toBe('none')
})

test.each([false, true])('deduplicates a workflow path input with custom and init_image mappings (reversed=%s)', (reversed) => {
  const copy = structuredClone(catalog)
  const config = (copy.connections[0]!.metadata.comfyui_workflows as Workflow[])[0]!.config
  const mappings = [
    { nodeId: '2', fieldName: 'image', mappedAs: 'custom' },
    { nodeId: '2', fieldName: 'image', mappedAs: 'init_image' },
    { nodeId: '2', fieldName: 'image', mappedAs: 'custom' },
  ]
  config.field_mappings = [config.field_mappings[0]!, ...(reversed ? mappings.reverse() : mappings)]
  config.workflow_api_json!['2'] = { class_type: 'LoadImagePath', _meta: { title: 'Load Image (Path)' }, inputs: { image: '/old/image.png' } }
  config.field_options = {}
  const before = JSON.stringify(config)
  const controls = fieldControls((copy.connections[0]!.metadata.comfyui_workflows as Workflow[])[0])
  expect(controls).toHaveLength(1)
  expect(controls[0]!.options).toEqual([])
  const input = buildInput({ ...step(), source: 'none', fields: { '2:image': '/new/image.png' } }, 'video', copy, { chatId: 'chat', jobId: 'job' })
  expect(input.parameters.comfyui_field_values.init_image).toBe('/new/image.png')
  expect(input.parameters.comfyui_field_values.custom).toEqual({})
  const source = buildInput({ ...step(), fields: { '2:image': '/new/image.png' } }, 'video', copy, { chatId: 'chat', jobId: 'job', sourceImageId: 'asset' })
  expect(source.parameters.comfyui_field_values.init_image).toBeUndefined()
  expect(source.parameters.comfyui_field_values.custom).toEqual({})
  expect(JSON.stringify(config)).toBe(before)
})
test('retains separate workflow nodes even when their titles and input names match', () => {
  const copy = structuredClone(workflow)
  copy.config.workflow_api_json!['4'] = structuredClone(copy.config.workflow_api_json!['2']!)
  copy.config.field_mappings.push({ nodeId: '4', fieldName: 'image', mappedAs: 'custom' })
  expect(fieldControls(copy).filter((field) => field.key.endsWith(':image')).map((field) => field.key)).toEqual(['2:image', '4:image'])
})
