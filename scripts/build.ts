const root = new URL('../', import.meta.url).pathname
for (const entry of ['backend', 'frontend']) {
  const build = await Bun.build({
    entrypoints: [`${root}src/${entry}.ts`], outdir: `${root}dist`,
    naming: `${entry}.js`, target: 'browser', format: 'esm',
    banner: '// QuickGen 0.1.1 — generated from src/.',
  })
  if (!build.success) throw new Error(build.logs.map(String).join('\n'))
}
console.log('Built self-contained backend and frontend bundles.')
