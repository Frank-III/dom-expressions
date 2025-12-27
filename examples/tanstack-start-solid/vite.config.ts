import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import solidOxc from 'vite-plugin-solid-oxc'
import { nitro } from 'nitro/vite'

export default defineConfig({
  plugins: [
    devtools(),
    nitro(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    solidOxc({
      // TanStack Start ships JSX in node_modules, compile everything
      exclude: [],
      hydratable: true,
    }),
  ],
})
