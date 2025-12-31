# Benchmarks

Benchmark solid-jsx-oxc against babel-preset-solid.

## Setup

Clone the test repositories:

```bash
# OpenTUI (154 tests)
git clone https://github.com/sst/opentui.git benchmark/opentui
cd benchmark/opentui && pnpm install && cd ../..

# Solid Primitives (800+ tests)
git clone https://github.com/solidjs-community/solid-primitives.git benchmark/solid-primitives
cd benchmark/solid-primitives && pnpm install && cd ../..
```

## Run Benchmarks

```bash
# Pure transform speed benchmark
bun run benchmark/scripts/benchmark.ts

# Run OpenTUI tests with OXC
cd benchmark/opentui/packages/solid
bun test --preload ./scripts/preload-oxc.ts

# Run Solid Primitives tests with OXC
cd benchmark/solid-primitives
pnpm vitest run -c ./configs/vitest.config.oxc.ts
```

## Results

On Apple M1:

### OpenTUI (154 tests, 18 JSX files)

| Compiler | Transform Time | Speedup |
|----------|---------------|---------|
| babel-preset-solid | ~180ms | 1x |
| solid-jsx-oxc | ~6.3ms | **28x faster** |

- ✅ 154/154 tests pass with both compilers

### Solid Primitives (800+ tests, 60+ JSX files)

| Compiler | Transform Time | Speedup |
|----------|---------------|---------|
| babel-preset-solid | ~116ms | 1x |
| solid-jsx-oxc | ~4.75ms | **24x faster** |

- ✅ 790 tests pass with OXC (vs 785 with Babel)
- Remaining differences due to minor output variations (e.g., `memo()` wrapping)
