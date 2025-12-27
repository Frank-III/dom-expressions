# `test-solid-vite7`

Small Vite + Solid app used as an integration test for:

- `solid-jsx-oxc` (OXC-based Solid JSX compiler)
- `vite-plugin-solid-oxc` (Vite plugin that calls the compiler)

## Running

Build the workspace packages first (this produces the native `.node` binary and the Vite plugin `dist/` files):

```bash
cd ..
bun install
bun run build
```

Then run the app:

```bash
cd test-solid-vite7
pnpm install
pnpm dev
```
