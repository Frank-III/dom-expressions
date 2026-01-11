#!/usr/bin/env bun

import { $ } from "bun";
import { parseArgs } from "util";
import { dirname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";

type PackageJson = {
  name: string;
  version: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type WorkspacePackage = {
  name: string;
  version: string;
  dir: string;
  manifest: PackageJson;
  internalDeps: string[];
};

type Options = {
  tag: string;
  publish: boolean;
  yes: boolean;
  dryRun: boolean;
  list: boolean;
  skipBuild: boolean;
  tolerateRepublish: boolean;
  allowDirty: boolean;
  runScripts: boolean;
  registry?: string;
  access?: string;
  otp?: string;
  only: Set<string>;
  exclude: Set<string>;
  help: boolean;
};

class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

function printHelp() {
  console.log(
    `
solid-jsx-oxc publish (monorepo)

Usage:
  bun publish-alpha.ts [options]

Behavior:
  - Default mode is dry-run (prints + runs build, but does not publish)
  - Use --publish to actually publish (asks for confirmation)
  - Use --yes to publish without confirmation

Options:
  --list                     Print publish order and exit
  --tag <name>               Dist-tag to publish under (default: alpha)
  --only <pkg>               Only publish a package (repeatable, includes internal deps)
  --exclude <pkg>            Exclude a package (repeatable)

Publish:
  --publish                  Actually publish to the registry
  --yes                      Skip confirmation prompt (implies --publish)
  --dry-run                  Force dry run (overrides --publish/--yes)
  --tolerate-republish        Do not fail if version already exists
  --allow-dirty              Allow uncommitted git changes (publish only)

Build:
  --skip-build               Skip running each package's build script

Registry:
  --registry <url>           Override registry URL
  --access <public|...>      Publish access level (mostly for scoped packages)
  --otp <code>               One-time password for 2FA
  --run-scripts              Allow lifecycle scripts during bun publish

Other:
  -h, --help                 Show help

Examples:
  bun publish-alpha.ts --list
  bun publish-alpha.ts
  bun publish-alpha.ts --only solid-jsx-oxc
  bun publish-alpha.ts --exclude babel-plugin-jsx-dom-expressions
  bun publish-alpha.ts --tag alpha --publish
  bun publish-alpha.ts --tag next --yes --otp 123456
`.trimStart(),
  );
}

function stringArray(value: unknown): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [String(value)];
}

function getInternalDeps(manifest: PackageJson, internalNames: Set<string>): string[] {
  const deps = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  };

  return Object.keys(deps).filter((name) => internalNames.has(name));
}

function topoSort(packages: WorkspacePackage[]): WorkspacePackage[] {
  const byName = new Map<string, WorkspacePackage>();
  for (const pkg of packages) byName.set(pkg.name, pkg);

  const names = Array.from(byName.keys());

  const outgoing = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const name of names) {
    outgoing.set(name, new Set());
    indegree.set(name, 0);
  }

  for (const pkg of packages) {
    for (const dep of pkg.internalDeps) {
      const outs = outgoing.get(dep);
      if (!outs) continue;
      if (outs.has(pkg.name)) continue;
      outs.add(pkg.name);
      indegree.set(pkg.name, (indegree.get(pkg.name) ?? 0) + 1);
    }
  }

  const priority = new Map<string, number>([["solid-jsx-oxc", 0]]);
  const sortNames = (a: string, b: string) => {
    const pa = priority.get(a) ?? 1_000_000;
    const pb = priority.get(b) ?? 1_000_000;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  };

  const queue = names.filter((n) => (indegree.get(n) ?? 0) === 0).sort(sortNames);
  const ordered: WorkspacePackage[] = [];

  while (queue.length > 0) {
    const name = queue.shift()!;
    ordered.push(byName.get(name)!);

    for (const next of outgoing.get(name) ?? []) {
      const nextDeg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
        queue.sort(sortNames);
      }
    }
  }

  if (ordered.length !== packages.length) {
    return packages.slice().sort((a, b) => sortNames(a.name, b.name));
  }

  return ordered;
}

async function ensureCleanGit(repoRoot: string) {
  const status = (await $`git status --porcelain`.cwd(repoRoot).text()).trim();
  if (status.length > 0) {
    throw new UserError("Working tree is not clean. Commit/stash first or pass --allow-dirty.");
  }
}

type WorkspacePatterns = {
  include: string[];
  exclude: string[];
};

function normalizeWorkspacePattern(pattern: string): string {
  return pattern.replace(/\\/g, "/").replace(/\/$/, "");
}

function toPackageJsonGlob(pattern: string): string {
  return pattern.endsWith("package.json") ? pattern : `${pattern}/package.json`;
}

async function getWorkspacePackageJsonPatterns(repoRoot: string): Promise<WorkspacePatterns> {
  const rootManifestPath = join(repoRoot, "package.json");
  const rootManifest = (await Bun.file(rootManifestPath).json()) as { workspaces?: unknown };

  const rawWorkspaces = rootManifest?.workspaces;

  let patterns: string[];

  if (Array.isArray(rawWorkspaces)) {
    patterns = rawWorkspaces.map(String);
  } else if (
    rawWorkspaces &&
    typeof rawWorkspaces === "object" &&
    Array.isArray((rawWorkspaces as { packages?: unknown }).packages)
  ) {
    patterns = (rawWorkspaces as { packages: unknown[] }).packages.map(String);
  } else {
    patterns = ["packages/*"];
  }

  const include: string[] = [];
  const exclude: string[] = [];

  for (const raw of patterns) {
    const normalized = normalizeWorkspacePattern(String(raw));
    if (!normalized) continue;

    if (normalized.startsWith("!")) {
      const withoutBang = normalized.slice(1);
      if (withoutBang) exclude.push(toPackageJsonGlob(withoutBang));
      continue;
    }

    include.push(toPackageJsonGlob(normalized));
  }

  return {
    include: include.length > 0 ? include : ["packages/*/package.json"],
    exclude,
  };
}

async function readWorkspacePackages(repoRoot: string): Promise<WorkspacePackage[]> {
  const patterns = await getWorkspacePackageJsonPatterns(repoRoot);

  const relPaths = new Set<string>();
  for (const pattern of patterns.include) {
    const glob = new Bun.Glob(pattern);
    for await (const relPath of glob.scan({ cwd: repoRoot, onlyFiles: true })) {
      relPaths.add(relPath);
    }
  }

  if (patterns.exclude.length > 0) {
    for (const pattern of patterns.exclude) {
      const glob = new Bun.Glob(pattern);
      for await (const relPath of glob.scan({ cwd: repoRoot, onlyFiles: true })) {
        relPaths.delete(relPath);
      }
    }
  }

  const found: WorkspacePackage[] = [];

  for (const relPath of Array.from(relPaths).sort()) {
    const absPath = join(repoRoot, relPath);
    const manifest = (await Bun.file(absPath).json()) as PackageJson;

    if (!manifest || typeof manifest !== "object") continue;
    if (manifest.private) continue;

    if (!manifest.name || !manifest.version) {
      throw new UserError(`Invalid package.json: ${relPath}`);
    }

    found.push({
      name: manifest.name,
      version: manifest.version,
      dir: dirname(absPath),
      manifest,
      internalDeps: [],
    });
  }

  const internalNames = new Set(found.map((p) => p.name));
  for (const pkg of found) {
    pkg.internalDeps = getInternalDeps(pkg.manifest, internalNames);
  }

  return topoSort(found);
}

function validateTag(tag: string): void {
  if (!tag || tag.includes(" ") || tag.includes("\n")) {
    throw new UserError(`Invalid tag: "${tag}". Tag must be non-empty and contain no whitespace.`);
  }
}

function parseCli(): Options {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      tag: { type: "string", default: "alpha" },
      list: { type: "boolean", default: false },

      publish: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },

      "skip-build": { type: "boolean", default: false },
      "tolerate-republish": { type: "boolean", default: false },
      "allow-dirty": { type: "boolean", default: false },
      "run-scripts": { type: "boolean", default: false },
      registry: { type: "string" },
      access: { type: "string" },
      otp: { type: "string" },

      only: { type: "string", multiple: true },
      exclude: { type: "string", multiple: true },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  const tag = String(values.tag ?? "alpha");
  validateTag(tag);

  const yes = Boolean(values.yes);
  const publish = Boolean(values.publish) || yes;
  const dryRun = Boolean(values["dry-run"]) || !publish;

  return {
    tag,
    publish,
    yes,
    dryRun,
    list: Boolean(values.list),
    skipBuild: Boolean(values["skip-build"]),
    tolerateRepublish: Boolean(values["tolerate-republish"]),
    allowDirty: Boolean(values["allow-dirty"]),
    runScripts: Boolean(values["run-scripts"]),
    registry: values.registry ? String(values.registry) : undefined,
    access: values.access ? String(values.access) : undefined,
    otp: values.otp ? String(values.otp) : undefined,
    only: new Set(stringArray(values.only)),
    exclude: new Set(stringArray(values.exclude)),
    help: Boolean(values.help),
  };
}

async function promptToProceed(options: Options, targets: WorkspacePackage[]): Promise<boolean> {
  if (options.dryRun) return true;
  if (options.yes) return true;

  process.stdout.write(
    `\n💬 About to publish ${targets.length} package(s) with tag "${options.tag}". Continue? (y/N) `,
  );

  const buffer = Buffer.alloc(1);
  await input.read(buffer, 0, 1);
  const char = buffer.toString().toLowerCase();

  process.stdout.write("\n");

  return char === "y";
}

function printTargets(targets: WorkspacePackage[]) {
  for (const pkg of targets) {
    console.log(`  • ${pkg.name}@${pkg.version}`);
  }
}

function resolveTargets(
  packages: WorkspacePackage[],
  only: Set<string>,
  exclude: Set<string>,
): WorkspacePackage[] {
  let candidates = packages;

  // If --only is specified, only include those packages and their dependencies
  if (only.size > 0) {
    const byName = new Map(packages.map((p) => [p.name, p] as const));
    const resolved = new Set<string>();
    const queue = Array.from(only);

    while (queue.length > 0) {
      const name = queue.pop()!;
      if (resolved.has(name)) continue;
      resolved.add(name);

      const pkg = byName.get(name);
      if (!pkg) continue;

      for (const dep of pkg.internalDeps) {
        if (!resolved.has(dep)) queue.push(dep);
      }
    }

    candidates = packages.filter((p) => resolved.has(p.name));
  }

  // Filter out excluded packages
  return candidates.filter((p) => !exclude.has(p.name));
}

function generateHtmlReport(targets: WorkspacePackage[], options: Options): string {
  const registry = options.registry || "https://www.npmjs.com";
  const baseUrl = registry.replace(/\/$/, "");

  const packages = targets
    .map(
      (pkg) => `
    <li class="package-item">
      <a href="${baseUrl}/package/${pkg.name}" target="_blank" class="package-link">
        <span class="package-name">${pkg.name}</span>
        <span class="package-version">@${pkg.version}</span>
      </a>
      <span class="tag-badge">${options.tag}</span>
    </li>
  `,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>solid-jsx-oxc Publish Results</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 100%;
      padding: 40px;
    }

    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 28px;
    }

    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 14px;
    }

    .status {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status.dry-run {
      background: #fff3cd;
      color: #856404;
    }

    .status.publish {
      background: #d4edda;
      color: #155724;
    }

    .packages-list {
      list-style: none;
      margin-bottom: 20px;
    }

    .package-item {
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #eee;
      transition: background 0.2s;
    }

    .package-item:last-child {
      border-bottom: none;
    }

    .package-item:hover {
      background: #f8f9fa;
      padding: 12px;
      margin: 0 -12px;
      border-radius: 6px;
    }

    .package-link {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .package-name {
      font-weight: 600;
      color: #667eea;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 14px;
    }

    .package-version {
      font-size: 12px;
      color: #999;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .tag-badge {
      display: inline-block;
      background: #e9ecef;
      color: #495057;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .footer {
      text-align: center;
      color: #999;
      font-size: 12px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #eee;
    }

    .footer a {
      color: #667eea;
      text-decoration: none;
    }

    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📦 solid-jsx-oxc</h1>
    <p class="subtitle">Publish Results</p>

    <div class="status ${options.dryRun ? "dry-run" : "publish"}">
      ${options.dryRun ? "🔄 Dry Run" : "✅ Published"}
    </div>

    <ul class="packages-list">
      ${packages}
    </ul>

    <div class="footer">
      <p>Click any package to view on npm registry</p>
      <p style="margin-top: 8px;">Registry: <a href="${baseUrl}" target="_blank">${baseUrl}</a></p>
    </div>
  </div>
</body>
</html>
`;
}

async function runWithPty(
  cmd: string[],
  cwd: string,
): Promise<number> {
  const proc = Bun.spawn(cmd, {
    cwd,
    terminal: {
      cols: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
      data(term, data) {
        process.stdout.write(data);
      },
    },
  });

  // Handle terminal resize
  const resizeHandler = () => {
    if (proc.terminal) {
      proc.terminal.resize(process.stdout.columns ?? 80, process.stdout.rows ?? 24);
    }
  };

  process.stdout.on("resize", resizeHandler);

  try {
    const code = await proc.exited;
    process.stdout.off("resize", resizeHandler);
    return code;
  } catch (err) {
    process.stdout.off("resize", resizeHandler);
    throw err;
  }
}

async function main() {
  const options = parseCli();
  const repoRoot = import.meta.dir;

  if (options.help) {
    printHelp();
    return;
  }

  const packages = await readWorkspacePackages(repoRoot);

  if (packages.length === 0) {
    throw new UserError("No publishable workspace packages found.");
  }

  const targets = resolveTargets(packages, options.only, options.exclude);

  if (targets.length === 0) {
    throw new UserError("No matching packages to publish.");
  }

  if (options.only.size > 0) {
    const missing = Array.from(options.only).filter((name) => !packages.some((p) => p.name === name));
    if (missing.length > 0) {
      throw new UserError(`Unknown package(s): ${missing.join(", ")}`);
    }
  }

  if (options.list) {
    console.log("\n📦 Publish order:");
    printTargets(targets);
    return;
  }

  if (!options.dryRun && !options.allowDirty) {
    await ensureCleanGit(repoRoot);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  solid-jsx-oxc v${targets[0].version}`);
  console.log(`${"═".repeat(60)}\n`);

  console.log(`📍 Tag: ${options.tag}`);
  console.log(`📝 Mode: ${options.dryRun ? "🔄 dry-run" : "🚀 publish"}`);
  if (options.registry) console.log(`🌐 Registry: ${options.registry}`);
  if (options.access) console.log(`🔒 Access: ${options.access}`);
  console.log(`📦 Packages (${targets.length}):`);
  printTargets(targets);
  console.log("");

  const proceed = await promptToProceed(options, targets);
  if (!proceed) {
    console.log("⏹️  Cancelled.\n");
    return;
  }

  for (const pkg of targets) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📦 ${pkg.name}@${pkg.version}`);
    console.log(`${"─".repeat(60)}`);

    if (!options.skipBuild && pkg.manifest.scripts?.build) {
      console.log("\n🔨 Building...");
      const buildCode = await runWithPty(["bun", "run", "build"], pkg.dir);
      if (buildCode !== 0) {
        throw new UserError(`Build failed for ${pkg.name} (exit code ${buildCode})`);
      }
    }

    const publishArgs: string[] = ["bun", "publish", "--tag", options.tag];

    if (options.dryRun) publishArgs.push("--dry-run");
    if (options.tolerateRepublish) publishArgs.push("--tolerate-republish");
    if (!options.runScripts) publishArgs.push("--ignore-scripts");

    if (options.registry) publishArgs.push(`--registry=${options.registry}`);
    if (options.access) publishArgs.push(`--access=${options.access}`);
    if (options.otp) publishArgs.push(`--otp=${options.otp}`);

    console.log("\n🚢 Publishing...");
    const publishCode = await runWithPty(publishArgs, pkg.dir);
    if (publishCode !== 0) {
      throw new UserError(`Publishing failed for ${pkg.name} (exit code ${publishCode})`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${options.dryRun ? "✅ Dry run complete" : "🎉 Publish complete"}!`);
  console.log(`${"═".repeat(60)}\n`);

  // Generate and open HTML report
  const htmlReport = generateHtmlReport(targets, options);
  const reportPath = join(repoRoot, "publish-report.html");
  await Bun.write(reportPath, htmlReport);

  console.log(`📄 Report saved: ${reportPath}`);
  console.log("🌐 Opening in browser...\n");

  // Open in default browser
  if (process.platform === "darwin") {
    await $`open ${reportPath}`;
  } else if (process.platform === "linux") {
    await $`xdg-open ${reportPath}`;
  } else if (process.platform === "win32") {
    await $`start ${reportPath}`;
  }
}

await main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ ${message}`);
  process.exit(1);
});
