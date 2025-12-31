#!/usr/bin/env bun
/**
 * Benchmark solid-jsx-oxc vs babel-preset-solid
 *
 * Usage: bun run benchmark/scripts/benchmark.ts [path-to-repo]
 */

import { transformAsync } from "@babel/core"
// @ts-expect-error
import solid from "babel-preset-solid"
// @ts-expect-error
import ts from "@babel/preset-typescript"
import { transform as transformOxc } from "solid-jsx-oxc"
import { Glob } from "bun"

const repoPath = process.argv[2] || "benchmark/solid-primitives"

// Find all JSX/TSX files
const glob = new Glob("**/*.{jsx,tsx}")
const files: { path: string; code: string }[] = []

for await (const path of glob.scan({ cwd: repoPath, onlyFiles: true })) {
  if (path.includes("node_modules") || path.includes("dist")) continue
  const fullPath = `${repoPath}/${path}`
  const code = await Bun.file(fullPath).text()
  if (code.includes("<") && (code.includes("jsx") || code.includes("tsx") || code.includes("return"))) {
    files.push({ path, code })
  }
}

console.log(`Found ${files.length} JSX/TSX files in ${repoPath}\n`)

// Benchmark function
async function benchmark(name: string, fn: () => Promise<void>, iterations = 5) {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }
  const avg = times.reduce((a, b) => a + b) / times.length
  const min = Math.min(...times)
  const max = Math.max(...times)
  return { name, avg, min, max }
}

// Run Babel
const babelResult = await benchmark("Babel", async () => {
  for (const file of files) {
    await transformAsync(file.code, {
      filename: file.path,
      presets: [[solid, { generate: "dom" }], [ts]],
    })
  }
})

// Run OXC
const oxcResult = await benchmark("OXC", async () => {
  for (const file of files) {
    transformOxc(file.code, { generate: "dom", filename: file.path })
  }
})

// Print results
console.log("═".repeat(60))
console.log("  BENCHMARK RESULTS")
console.log("═".repeat(60))
console.log(`\n  Babel: ${babelResult.avg.toFixed(2)}ms (min: ${babelResult.min.toFixed(2)}ms, max: ${babelResult.max.toFixed(2)}ms)`)
console.log(`  OXC:   ${oxcResult.avg.toFixed(2)}ms (min: ${oxcResult.min.toFixed(2)}ms, max: ${oxcResult.max.toFixed(2)}ms)`)
console.log(`\n  🚀 solid-jsx-oxc is ${(babelResult.avg / oxcResult.avg).toFixed(1)}x faster than babel`)
console.log("═".repeat(60))
