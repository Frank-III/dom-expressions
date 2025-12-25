//! Transform options for the Solid JSX compiler

use std::cell::RefCell;
use std::collections::HashSet;
use oxc_span::SourceType;

/// Configuration options for the JSX transform
#[derive(Default)]
pub struct TransformOptions<'a> {
    /// The module to import runtime helpers from
    pub module_name: &'a str,

    /// Generate mode: "dom", "ssr", or "universal"
    pub generate: GenerateMode,

    /// Whether to enable hydration support
    pub hydratable: bool,

    /// Whether to delegate events
    pub delegate_events: bool,

    /// Custom delegated events
    pub delegated_events: Vec<&'a str>,

    /// Whether to wrap conditionals
    pub wrap_conditionals: bool,

    /// Whether to pass context to custom elements
    pub context_to_custom_elements: bool,

    /// Built-in components (For, Show, etc.)
    pub built_ins: Vec<&'a str>,

    /// Effect wrapper function name
    pub effect_wrapper: &'a str,

    /// Memo wrapper function name
    pub memo_wrapper: &'a str,

    /// Source filename
    pub filename: &'a str,

    /// Source type (tsx, jsx, etc.)
    pub source_type: SourceType,

    /// Whether to generate source maps
    pub source_map: bool,

    /// Static marker comment
    pub static_marker: &'a str,

    /// Collected templates
    pub templates: RefCell<Vec<(String, bool)>>,

    /// Collected helper imports
    pub helpers: RefCell<HashSet<String>>,

    /// Collected delegated events
    pub delegates: RefCell<HashSet<String>>,
}

#[derive(Default, Clone, Copy, PartialEq, Eq)]
pub enum GenerateMode {
    #[default]
    Dom,
    Ssr,
    Universal,
}

impl<'a> TransformOptions<'a> {
    pub fn solid_defaults() -> Self {
        Self {
            module_name: "solid-js/web",
            generate: GenerateMode::Dom,
            hydratable: false,
            delegate_events: true,
            delegated_events: vec![],
            wrap_conditionals: true,
            context_to_custom_elements: true,
            built_ins: vec![
                "For",
                "Show",
                "Switch",
                "Match",
                "Suspense",
                "SuspenseList",
                "Portal",
                "Index",
                "Dynamic",
                "ErrorBoundary",
            ],
            effect_wrapper: "effect",
            memo_wrapper: "memo",
            filename: "input.jsx",
            source_type: SourceType::tsx(),
            source_map: false,
            static_marker: "@once",
            templates: RefCell::new(vec![]),
            helpers: RefCell::new(HashSet::new()),
            delegates: RefCell::new(HashSet::new()),
        }
    }

    /// Register a helper import
    pub fn register_helper(&self, name: &str) {
        self.helpers.borrow_mut().insert(name.to_string());
    }

    /// Register an event for delegation
    pub fn register_delegate(&self, event: &str) {
        self.delegates.borrow_mut().insert(event.to_string());
    }

    /// Push a template and return its index
    pub fn push_template(&self, template: String, is_svg: bool) -> usize {
        let mut templates = self.templates.borrow_mut();
        let index = templates.len();
        templates.push((template, is_svg));
        index
    }
}
