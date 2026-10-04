# Lumiverse QuickGen

A separate Spindle extension with a drawer panel and an input-bar shortcut. Select one existing ComfyUI workflow, an ImgGen Main Preset, and mapped field values, then generate an image or video.

**Requires Lumiverse v1.2.4 or newer with the QuickGen API changes.**

## Use

1. Import **API-format** workflows in Lumiverse's Image Gen Connections settings. Map a `positive_prompt` field. Map `init_image` to a Load Image field when the workflow needs an image. Configure additional CUSTOM FIELDS and their choices in ImgGen.
2. Open QuickGen from the drawer or the input bar's Extras menu.
3. Select a connection, saved workflow, Main Preset, and output type (**Image** or **Video**).
4. Choose values under **Workflow fields**. Load Image filename/path controls appear only when that input is explicitly enabled as a CUSTOM FIELD. Saved filename choices appear as a dropdown; path inputs remain editable. Numeric, boolean, text, and stored dropdown choices retain their types.
5. **Source image override** appears only when Initial / Reference Image (`init_image`) is mapped to an existing workflow node/input. Leave it on **Use workflow image fields / no override** to use the ComfyUI filename selection. Alternatively, choose a still image from Lumiverse or **Previous QuickGen image**; this uploads that image to ComfyUI and replaces the mapped Load Image value. The filename control is disabled while an override is selected. An ImgGen result can be selected from the Lumiverse images list after Refresh.
6. Choose **Output**: **Preview only** (the default), **Insert into chat**, or **Attach to last message**, using the same wording as ImgGen. This applies to both images and videos.
7. Click **Generate image** or **Generate video**. QuickGen runs only the chosen workflow. Review the result in the panel. With **Insert into chat**, the result is also posted to the chat where the run started. With **Attach to last message**, media is added to the last message captured when the run starts. Preview results also offer **Insert into chat** and **Attach to last message** buttons for posting later.

Chat insertion requires the **Chat Mutation** permission, requested when you choose to insert. Preview-only generation works without it. Insert into chat creates an assistant message containing the saved image or a video player. Attach to last message appends that media to an existing message while preserving its text, metadata, and existing attachments. Neither action triggers an assistant reply. Manual attachment captures the last message in the result’s original chat on the first attempt; retries keep that target. An empty chat is rejected before generation when attachment is selected, and a deleted target leaves the generated media available with an error. Switching chats does not change the destination, including for a previous image retained during a video run. Posted results show **Inserted into chat** or **Attached to message** and cannot be posted again through that result's button. If posting fails, the generated media stays available and can be retried.

QuickGen remembers your last selection automatically in its per-user storage. “Use active Main Preset” captures its ID at the start of the job. A selected preset is used for that request without activating it in ImgGen. Prompt overrides are optional; with a parsed preset, they still go through its parser. The option to skip native character and active preset LoRAs is under **Prompt and run options**.

**Refresh** reloads saved workflows, Main Presets, and Lumiverse source images. Filename choices come from the workflow's saved ImgGen configuration; Refresh does not rescan ComfyUI's files. Update/reimport the workflow in ImgGen to change those saved choices.

Version 0.1.1 uses one workflow panel and removes the New, Duplicate, Delete, and automatic Run sequence controls. Those buttons previously managed QuickGen recipes, which were saved combinations of existing workflows and presets. They never managed the underlying ComfyUI workflows. On first use after upgrading, QuickGen carries over the selected recipe's configured video step, or its image step if no video step was configured. The old recipe storage is retained, and completed assets remain available.

Version 0.1.2 removes duplicate controls when the same node input has both a standard mapping and a CUSTOM FIELD mapping. The one remaining control keeps its saved value and options. Separate nodes with similar names remain separate controls.

Version 0.1.3 follows the saved mappings for image controls:

| Initial / Reference Image mapped | Image input enabled as CUSTOM FIELD | Visible controls |
| --- | --- | --- |
| No | No | Neither |
| Yes | No | Source image override |
| No | Yes | Filename/path field |
| Yes | Yes | Source image override and one filename/path field |

When a source override is selected, its mapped filename/path control is disabled. Switching to a workflow without an initial-image mapping clears the source override, and generation ignores stale source selections and hidden path values. Refresh rereads mappings changed in ImgGen.

## Update an existing installation

Replace `src/`, `dist/`, `spindle.json`, `package.json`, and `scripts/` in the installed extension's `repo` folder with this version, then reload the QuickGen extension and refresh the Lumiverse page. Preserve the extension's user storage. Version 0.1.4 adds optional chat insertion using the existing Spindle chat API; no further Lumiverse core changes are required. Existing selections migrate to **Preview only**.

## Install locally

Requires **Lumiverse v1.2.4 or newer** with the QuickGen API changes from the pending Lumiverse PR. Until that PR is merged, use the Lumiverse `quick-gen` branch; the released v1.2.4 alone does not include the required APIs.

1. Use a **Lumiverse v1.2.4 or newer** build containing the QuickGen API changes and restart it.
2. Copy this extension's folder to `<Lumiverse data directory>/extensions/quick_gen`. Include `spindle.json` and `dist/`; `node_modules` is not needed to run the built bundles.
3. Use **Import local extensions** in Spindle. Lumiverse normalizes the copied folder into its managed `repo` layout. Enable QuickGen and grant its **Image Generation** and **Images** permissions.

The manifest's GitHub URL is the intended repository metadata; this work does not publish a repository. Use local import until the repository is published.

## Build and test

```sh
bun install
bun run check
```

The shipped `dist/backend.js` and `dist/frontend.js` are self-contained. No MCP server, additional runtime service, or chat commands are required. Generation runs in the extension backend using the native Spindle generation API.

## Lumiverse APIs used

- `spindle.imageGen.getPromptPresets(userId?)`: read Main Presets and active preset/connection IDs, gated by `image_gen` and account scope.
- `generateNative()` request-local `connection_id`, `source_image_id`, `output_media_type`, and `output_node_id` options. Source bytes are loaded on the host; large image/video data URLs stay out of extension messages with `includeDataUrl: false`.
- Preset mode/parser selection follows an explicitly selected preset; invalid preset/workflow IDs fail instead of silently falling back.
- Request-local `comfyui_field_values.node_fields` preserves independent values for mapped sampler/model controls on different nodes. CUSTOM FIELDS retain their existing per-node API. Native LoRA fields are used unless the run opts to skip them.
- ComfyUI final-output collection recognizes native SaveVideo and VideoHelperSuite file descriptors. Typed MIME, asset URL, and media kind are returned. Existing image callers keep their original output selection unless they request a media kind/node.
- `spindle.imageGen.cancelNative(jobId, userId?)`: cancels only a generation belonging to the calling extension and account. Extension jobs use a separate cancellation namespace from ImgGen.
- Generated filenames preserve their MIME extension using the existing media store. The existing authenticated asset endpoint supplies video byte-range serving and posters.

Once the QuickGen API changes are present, the extension uses these host APIs without further Lumiverse code changes or database migrations. Results default to preview assets. Chat insertion is optional; the character gallery is not changed. Inserted and attached media are embedded in message content rather than written to ImgGen’s native attachment metadata, which the current Spindle API cannot update. Attaching edits the target message’s active swipe. QuickGen fields use ImgGen’s shared theme tokens, shaded backgrounds, spacing, borders, and focus styles.

## Scope and limits

- Version 0.1.4 supports saved **ComfyUI** workflows. SwarmUI and arbitrary MCP runners are not implemented.
- A mapped positive prompt is required. The workflow's models and custom nodes must already be installed on the configured ComfyUI server. A source image requires an `init_image` mapping.
- For videos, use MP4 or WebM for browser playback. Other collected formats depend on the browser's codecs. Use **Final output node** when multiple nodes save the same kind of media.
- Progress and cancellation work while the extension backend is running; changing chats or closing the drawer does not end a job. A Lumiverse/extension restart ends live tracking. The last job and completed assets persist, but unfinished jobs are not automatically resumed.
- Imported field choices are used as saved. Refresh QuickGen after editing workflows or presets. ComfyUI validates additional model-specific limits, such as allowed frame counts.
- Mapped controls start from the imported workflow's values. Set a mapped seed to `-1` for a new random seed on each run. Separate sampler stages keep their individual values.
- Extension tests cover preset/workflow isolation, typed custom fields, Load Image choices and source overrides, single-workflow execution, legacy selection migration, video retry, and the panel. Actual GPU generation must still be verified against your installed image and video workflows.
