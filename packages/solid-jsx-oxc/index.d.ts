/**
 * solid-jsx-oxc - OXC-based JSX compiler for SolidJS
 */

export interface TransformOptions {
  /** The module to import runtime helpers from (default: 'solid-js/web') */
  moduleName?: string;
  /** Built-in components to pass through */
  builtIns?: string[];
  /** Pass context to custom elements (default: true) */
  contextToCustomElements?: boolean;
  /** Wrap conditionals in memos (default: true) */
  wrapConditionals?: boolean;
  /** Generate mode: 'dom' | 'ssr' | 'universal' (default: 'dom') */
  generate?: 'dom' | 'ssr' | 'universal';
  /** Enable hydration support (default: false) */
  hydratable?: boolean;
  /** Delegate events for better performance (default: true) */
  delegateEvents?: boolean;
  /** Generate source maps (default: false) */
  sourceMap?: boolean;
  /** Filename for source maps */
  filename?: string;
}

export interface TransformResult {
  /** The transformed code */
  code: string;
  /** Source map (if sourceMap option is true) */
  map?: string;
}

/**
 * Default transform options
 */
export declare const defaultOptions: TransformOptions;

/**
 * Transform JSX source code
 * @param source - The source code to transform
 * @param options - Transform options
 * @returns The transformed result with code and optional source map
 */
export declare function transform(source: string, options?: TransformOptions): TransformResult;

/**
 * Direct transform function (used by vite plugin)
 * @param source - The source code to transform
 * @param options - Transform options
 * @returns The transformed result with code and optional source map
 */
export declare function transformJsx(source: string, options?: TransformOptions): TransformResult;

/**
 * Create a preset configuration (for babel-preset-solid compatibility)
 * @param context - Context (ignored, for compatibility)
 * @param options - User options
 */
export declare function preset(context: unknown, options?: TransformOptions): {
  options: TransformOptions;
  transform: (source: string) => TransformResult;
};

declare const solidJsxOxc: {
  transform: typeof transform;
  transformJsx: typeof transformJsx;
  preset: typeof preset;
  defaultOptions: TransformOptions;
};

export default solidJsxOxc;
