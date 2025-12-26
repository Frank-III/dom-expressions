/**
 * Rolldown plugin for SolidJS using OXC-based compiler
 *
 * This plugin is compatible with both Rolldown and Rollup.
 * Since Rolldown uses OXC internally, this provides optimal performance.
 */

import type { Plugin } from 'rolldown';
import { createFilter, type FilterPattern } from '@rollup/pluginutils';

export interface SolidOxcOptions {
  /**
   * Filter which files to transform
   * @default /\.[jt]sx$/
   */
  include?: FilterPattern;

  /**
   * Filter which files to exclude
   * @default /node_modules/
   */
  exclude?: FilterPattern;

  /**
   * The module to import runtime helpers from
   * @default 'solid-js/web'
   */
  moduleName?: string;

  /**
   * Generate mode
   * @default 'dom'
   */
  generate?: 'dom' | 'ssr' | 'universal';

  /**
   * Enable hydration support
   * @default false
   */
  hydratable?: boolean;

  /**
   * Delegate events for better performance
   * @default true
   */
  delegateEvents?: boolean;

  /**
   * Wrap conditionals in memos
   * @default true
   */
  wrapConditionals?: boolean;

  /**
   * Pass context to custom elements
   * @default true
   */
  contextToCustomElements?: boolean;

  /**
   * Built-in components that should be passed through
   */
  builtIns?: string[];

  /**
   * Enable SSR mode
   * @default false
   */
  ssr?: boolean;
}

const defaultOptions: SolidOxcOptions = {
  include: /\.[jt]sx$/,
  exclude: /node_modules/,
  moduleName: 'solid-js/web',
  generate: 'dom',
  hydratable: false,
  delegateEvents: true,
  wrapConditionals: true,
  contextToCustomElements: true,
  builtIns: [
    'For',
    'Show',
    'Switch',
    'Match',
    'Suspense',
    'SuspenseList',
    'Portal',
    'Index',
    'Dynamic',
    'ErrorBoundary',
  ],
};

/**
 * Rolldown/Rollup plugin for SolidJS using OXC-based compiler
 */
export default function solidOxc(options: SolidOxcOptions = {}): Plugin {
  const opts = { ...defaultOptions, ...options };
  const filter = createFilter(opts.include, opts.exclude);

  // Lazy load the native module
  let solidJsxOxc: typeof import('solid-jsx-oxc') | null = null;

  return {
    name: 'rolldown-plugin-solid-oxc',

    async buildStart() {
      try {
        solidJsxOxc = await import('solid-jsx-oxc');
      } catch (e) {
        this.error(
          'Failed to load solid-jsx-oxc. Make sure it is built for your platform.'
        );
      }
    },

    async transform(code, id) {
      if (!filter(id)) {
        return null;
      }

      if (!solidJsxOxc) {
        this.error('solid-jsx-oxc module not loaded');
        return null;
      }

      const generate = opts.ssr ? 'ssr' : opts.generate;

      try {
        const result = solidJsxOxc.transformJsx(code, {
          filename: id,
          moduleName: opts.moduleName,
          generate,
          hydratable: opts.hydratable,
          delegateEvents: opts.delegateEvents,
          wrapConditionals: opts.wrapConditionals,
          contextToCustomElements: opts.contextToCustomElements,
          sourceMap: true,
        });

        return {
          code: result.code,
          map: result.map ? JSON.parse(result.map) : null,
        };
      } catch (e: any) {
        this.error(`Failed to transform ${id}: ${e.message}`);
        return null;
      }
    },

    // Ensure proper resolution of solid-js
    resolveId(source) {
      // Let Rolldown handle solid-js resolution
      return null;
    },
  };
}

// Named export for compatibility
export { solidOxc };
