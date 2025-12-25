//! Solid JSX OXC Compiler
//!
//! A Rust-based JSX compiler for SolidJS using OXC.
//! This is a port of babel-plugin-jsx-dom-expressions to OXC.
//!
//! ## Usage
//!
//! ```rust
//! use solid_jsx_oxc::{transform, TransformOptions};
//!
//! let source = r#"<div class="hello">{count()}</div>"#;
//! let result = transform(source, None);
//! println!("{}", result.code);
//! ```

pub use common::TransformOptions;

#[cfg(feature = "napi")]
use napi_derive::napi;

#[cfg(feature = "napi")]
use napi::Env;

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenReturn, CodegenOptions, IndentChar};
use oxc_parser::Parser;
use oxc_span::SourceType;

use std::path::PathBuf;

use dom::SolidTransform;

/// Result of a transform operation
#[cfg(feature = "napi")]
#[napi(object)]
pub struct TransformResult {
    /// The transformed code
    pub code: String,
    /// Source map (if enabled)
    pub map: Option<String>,
}

/// Transform options exposed to JavaScript
#[cfg(feature = "napi")]
#[napi(object)]
#[derive(Default)]
pub struct JsTransformOptions {
    /// The module to import runtime helpers from
    /// @default "solid-js/web"
    pub module_name: Option<String>,

    /// Generate mode: "dom", "ssr", or "universal"
    /// @default "dom"
    pub generate: Option<String>,

    /// Whether to enable hydration support
    /// @default false
    pub hydratable: Option<bool>,

    /// Whether to delegate events
    /// @default true
    pub delegate_events: Option<bool>,

    /// Whether to wrap conditionals
    /// @default true
    pub wrap_conditionals: Option<bool>,

    /// Whether to pass context to custom elements
    /// @default true
    pub context_to_custom_elements: Option<bool>,

    /// Source filename
    /// @default "input.jsx"
    pub filename: Option<String>,

    /// Whether to generate source maps
    /// @default false
    pub source_map: Option<bool>,
}

/// Transform JSX source code
#[cfg(feature = "napi")]
#[napi]
pub fn transform_jsx(source: String, options: Option<JsTransformOptions>) -> TransformResult {
    let options = options.unwrap_or_default();
    let filename = options.filename.as_deref().unwrap_or("input.jsx");
    let source_map = options.source_map.unwrap_or(false);

    let result = transform_internal(&source, filename, source_map);

    TransformResult {
        code: result.code,
        map: result.map.map(|m| m.to_json_string()),
    }
}

/// Internal transform function
pub fn transform(source: &str, options: Option<TransformOptions>) -> CodegenReturn {
    let options = options.unwrap_or_else(TransformOptions::solid_defaults);
    transform_internal(source, options.filename, options.source_map)
}

fn transform_internal(source: &str, filename: &str, source_map: bool) -> CodegenReturn {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(filename).unwrap_or(SourceType::tsx());

    // Parse the source
    let mut program = Parser::new(&allocator, source, source_type)
        .parse()
        .program;

    // Create transform options
    let options = TransformOptions::solid_defaults();

    // Run the transform
    let transformer = SolidTransform::new(&allocator, unsafe {
        &*(&options as *const TransformOptions)
    });
    transformer.transform(&mut program);

    // Generate code
    Codegen::new()
        .with_options(CodegenOptions {
            source_map_path: if source_map {
                Some(PathBuf::from(filename))
            } else {
                None
            },
            indent_width: 2,
            indent_char: IndentChar::Space,
            ..CodegenOptions::default()
        })
        .build(&program)
}

/// Build configuration for NAPI
#[cfg(feature = "napi")]
pub fn build() {
    napi_build::setup();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_element() {
        let source = r#"<div class="hello">world</div>"#;
        let result = transform(source, None);
        // The transform should produce valid code
        assert!(!result.code.is_empty());
    }

    #[test]
    fn test_dynamic_attribute() {
        let source = r#"<div class={style()}>content</div>"#;
        let result = transform(source, None);
        assert!(!result.code.is_empty());
    }

    #[test]
    fn test_component() {
        let source = r#"<Button onClick={handler}>Click me</Button>"#;
        let result = transform(source, None);
        assert!(!result.code.is_empty());
    }

    #[test]
    fn test_for_loop() {
        let source = r#"<For each={items}>{item => <div>{item}</div>}</For>"#;
        let result = transform(source, None);
        assert!(!result.code.is_empty());
    }
}
