import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['source/index.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node20',
  clean: true,
  dts: true,
  minify: true,
  sourcemap: false,
  treeshake: false,
  unbundle: false,
})
