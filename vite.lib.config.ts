import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'lib',
    lib: { entry: 'src/mascot/index.ts', formats: ['es'], fileName: () => 'loumi.js' },
  },
})
