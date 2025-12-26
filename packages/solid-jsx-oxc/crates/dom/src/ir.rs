//! Intermediate Representation for Solid JSX transforms
//! This IR is used to collect information during traversal
//! and then generate code in a second pass.

use std::cell::RefCell;
use indexmap::IndexSet;
use oxc_ast::ast::JSXChild;

/// Function type for transforming child JSX elements
pub type ChildTransformer<'a, 'b> = &'b dyn Fn(&JSXChild<'a>) -> Option<TransformResult>;

/// The result of transforming a JSX node
#[derive(Default)]
pub struct TransformResult {
    /// The HTML template string
    pub template: String,

    /// Template with all closing tags (for SSR)
    pub template_with_closing_tags: String,

    /// Variable declarations needed
    pub declarations: Vec<Declaration>,

    /// Expressions to execute (effects, inserts, etc.)
    pub exprs: Vec<Expr>,

    /// Dynamic attribute bindings
    pub dynamics: Vec<DynamicBinding>,

    /// Post-expressions (run after main effects)
    pub post_exprs: Vec<Expr>,

    /// Whether this is SVG
    pub is_svg: bool,

    /// Whether this contains custom elements
    pub has_custom_element: bool,

    /// The tag name (for native elements)
    pub tag_name: Option<String>,

    /// Whether to skip template generation
    pub skip_template: bool,

    /// The generated element ID
    pub id: Option<String>,

    /// Whether this result is just text
    pub text: bool,
}

/// A variable declaration
pub struct Declaration {
    pub name: String,
    pub init: String,
}

/// An expression to generate
pub struct Expr {
    pub code: String,
}

/// A dynamic attribute binding that needs effect wrapping
pub struct DynamicBinding {
    pub elem: String,
    pub key: String,
    pub value: String,
    pub is_svg: bool,
    pub is_ce: bool,
    pub tag_name: String,
}

/// Context for the current block being transformed
#[derive(Default)]
pub struct BlockContext {
    /// Current template string being built
    pub template: RefCell<String>,

    /// Templates collected at the file level
    pub templates: RefCell<Vec<TemplateInfo>>,

    /// Helper imports needed
    pub helpers: RefCell<IndexSet<String>>,

    /// Delegated events
    pub delegates: RefCell<IndexSet<String>>,

    /// Variable counter for unique names
    pub var_counter: RefCell<usize>,
}

pub struct TemplateInfo {
    pub content: String,
    pub is_svg: bool,
}

impl BlockContext {
    pub fn new() -> Self {
        Self::default()
    }

    /// Generate a unique variable name
    pub fn generate_uid(&self, prefix: &str) -> String {
        let mut counter = self.var_counter.borrow_mut();
        *counter += 1;
        format!("_{}{}", prefix, *counter)
    }

    /// Register a helper import
    pub fn register_helper(&self, name: &str) {
        self.helpers.borrow_mut().insert(name.to_string());
    }

    /// Register a delegated event
    pub fn register_delegate(&self, event: &str) {
        self.delegates.borrow_mut().insert(event.to_string());
    }

    /// Push a template and return its index
    pub fn push_template(&self, content: String, is_svg: bool) -> usize {
        let mut templates = self.templates.borrow_mut();
        let index = templates.len();
        templates.push(TemplateInfo { content, is_svg });
        index
    }
}
