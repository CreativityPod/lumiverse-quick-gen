export type MediaKind = 'image' | 'video'
export type Scalar = string | number | boolean
export interface Mapping { nodeId: string; fieldName: string; mappedAs: string }
export interface WorkflowConfig {
  workflow_api_json?: Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }>
  field_mappings: Mapping[]
  field_options?: Record<string, string[]>
}
export interface Workflow { id: string; name: string; config: WorkflowConfig }
export interface Connection { id: string; name: string; provider: string; metadata: Record<string, unknown> }
export interface Preset { id: string; name: string; mode: 'custom' | 'parsed_custom' }
export interface Catalog { activeId: string | null; activeConnectionId: string | null; presets: Preset[]; connections: Connection[] }
export interface Step {
  connectionId: string; workflowId: string; presetId: string
  prompt: string; negativePrompt: string; fields: Record<string, Scalar>
  source: string; outputNodeId: string; bypassLoras: boolean; timeoutSeconds: number
}
export interface Recipe { id: string; name: string; image: Step; video: Step }
export interface Settings { recipes: Recipe[]; selectedId: string }
export interface Asset { id: string; url: string; mime_type: string; original_filename: string; owner_chat_id?: string | null }
export interface Result { imageId: string; mediaUrl: string; mediaType: MediaKind; mimeType: string; prompt: string; jobId?: string }
export interface Job {
  id: string; chatId: string; recipeName: string; mode: MediaKind | 'sequence'
  phase: 'image' | 'video'; status: 'running' | 'cancelling' | 'cancelled' | 'complete' | 'failed'
  progress?: { step?: number; totalSteps?: number; nodeId?: string }
  image?: Result; video?: Result; error?: string; startedAt: number
}
export interface FieldControl { key: string; semantic: string; label: string; value: Scalar; options: string[] }
export const emptyStep = (kind: MediaKind): Step => ({
  connectionId: '', workflowId: '', presetId: '', prompt: '', negativePrompt: '', fields: {},
  source: kind === 'video' ? 'last' : 'none', outputNodeId: '', bypassLoras: kind === 'video', timeoutSeconds: kind === 'video' ? 1800 : 300,
})
export const newRecipe = (id: string, name = 'New recipe'): Recipe => ({ id, name, image: emptyStep('image'), video: emptyStep('video') })

export function workflows(connection?: Connection): Workflow[] {
  const entries = connection?.metadata.comfyui_workflows
  if (Array.isArray(entries) && entries.length) return entries.filter((entry): entry is Workflow => !!entry?.id && !!entry?.config?.workflow_api_json)
  const config = connection?.metadata.comfyui as WorkflowConfig | undefined
  return config?.workflow_api_json ? [{ id: '__legacy__', name: 'Imported workflow', config }] : []
}

export function fieldControls(workflow?: Workflow): FieldControl[] {
  if (!workflow) return []
  return workflow.config.field_mappings.filter((mapping) => !['positive_prompt', 'negative_prompt', 'init_image'].includes(mapping.mappedAs)).flatMap((mapping) => {
    const node = workflow.config.workflow_api_json?.[mapping.nodeId]
    const value = node?.inputs[mapping.fieldName]
    if (!['string', 'number', 'boolean'].includes(typeof value)) return []
    const key = `${mapping.nodeId}:${mapping.fieldName}`
    return [{ key, semantic: mapping.mappedAs, label: `${mapping.fieldName.replaceAll('_', ' ')} · ${node?._meta?.title || node?.class_type || mapping.nodeId} (${mapping.nodeId})`, value: value as Scalar, options: workflow.config.field_options?.[key] ?? [] }]
  })
}

export function normalizeRecipe(raw: unknown): Recipe {
  const r = raw as Partial<Recipe> | null
  if (!r || typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name.trim()) throw new Error('Recipe needs an ID and name.')
  const normalizeStep = (raw: unknown, kind: MediaKind): Step => {
    const step = raw as Partial<Step> | null
    const result = emptyStep(kind)
    for (const key of ['connectionId', 'workflowId', 'presetId', 'prompt', 'negativePrompt', 'source', 'outputNodeId'] as const) {
      if (typeof step?.[key] === 'string') result[key] = step[key]!
    }
    result.bypassLoras = typeof step?.bypassLoras === 'boolean' ? step.bypassLoras : result.bypassLoras
    result.timeoutSeconds = Math.max(15, Math.min(3600, Number(step?.timeoutSeconds) || result.timeoutSeconds))
    for (const [key, value] of Object.entries(step?.fields ?? {})) {
      if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string' || typeof value === 'boolean') result.fields[key] = value
    }
    return result
  }
  return { id: r.id, name: r.name.trim().slice(0, 100), image: normalizeStep(r.image, 'image'), video: normalizeStep(r.video, 'video') }
}

export function buildInput(step: Step, kind: MediaKind, catalog: Catalog, context: { chatId: string; jobId: string; sourceImageId?: string }) {
  const connection = catalog.connections.find((c) => c.id === step.connectionId)
  if (!connection || connection.provider !== 'comfyui') throw new Error('Choose an available ComfyUI connection.')
  const workflow = workflows(connection).find((w) => w.id === step.workflowId)
  if (!workflow) throw new Error(`Select a saved ${kind} workflow.`)
  const presetId = step.presetId || catalog.activeId
  if (presetId && !catalog.presets.some((p) => p.id === presetId)) throw new Error('Selected Main Preset is no longer available.')
  if (!presetId && !step.prompt.trim()) throw new Error('Select a Main Preset or enter a prompt override.')
  const mappings = workflow.config.field_mappings
  if (!mappings.some((m) => m.mappedAs === 'positive_prompt')) throw new Error('Map a positive prompt field in this workflow in ImgGen first.')
  if (step.source !== 'none' && !context.sourceImageId) throw new Error('Choose a source image or generate an image first.')
  if (context.sourceImageId && !mappings.some((m) => m.mappedAs === 'init_image')) throw new Error('This workflow needs an init_image mapping to receive the source image.')
  const patch: Record<string, unknown> = { custom: {}, node_fields: {} }
  for (const field of fieldControls(workflow)) {
    if (field.semantic.startsWith('lora_') && !step.bypassLoras) continue
    const value = Object.hasOwn(step.fields, field.key) ? step.fields[field.key]! : field.value
    if (typeof value !== typeof field.value || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Invalid value for ${field.label}.`)
    if (field.options.length && !field.options.includes(String(value))) throw new Error(`Choose an available value for ${field.label}.`)
    if (field.semantic === 'custom') (patch.custom as Record<string, Scalar>)[field.key] = value
    else (patch.node_fields as Record<string, Scalar>)[field.key] = value
  }
  return {
    chat_id: context.chatId, connection_id: connection.id, promptPresetId: presetId || undefined,
    prompt: step.prompt.trim() ? step.prompt : undefined,
    negativePrompt: step.negativePrompt.trim() ? step.negativePrompt : undefined,
    promptMode: presetId ? catalog.presets.find((p) => p.id === presetId)!.mode : 'custom' as const,
    source_image_id: context.sourceImageId, output_media_type: kind,
    output_node_id: step.outputNodeId || undefined, clientJobId: context.jobId,
    includeDataUrl: false, forceGeneration: true, generationTimeoutSeconds: step.timeoutSeconds,
    characterLora: step.bypassLoras ? { source: 'none' as const } : undefined,
    bypassActiveLoraPreset: step.bypassLoras,
    parameters: { workflow_id: workflow.id === '__legacy__' ? undefined : workflow.id, comfyui_field_values: patch },
  }
}

export async function executeSteps(mode: MediaKind | 'sequence', run: (kind: MediaKind, source?: string) => Promise<Result>, source?: string) {
  let image: Result | undefined
  let video: Result | undefined
  if (mode !== 'video') image = await run('image', source)
  if (mode !== 'image') video = await run('video', image?.imageId ?? source)
  return { image, video }
}
