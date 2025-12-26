//! Intermediate Representation for SSR transforms
//!
//! SSR uses a simpler IR than DOM since we're just building template strings.

use std::cell::RefCell;
use indexmap::IndexSet;
use oxc_ast::ast::JSXChild;

/// Function type for transforming child JSX elements
pub type SSRChildTransformer<'a, 'b> = &'b dyn Fn(&JSXChild<'a>) -> Option<SSRResult>;

/// The result of transforming a JSX node for SSR
#[derive(Default)]
pub struct SSRResult {
    /// Static template parts (the strings between dynamic values)
    pub template_parts: Vec<String>,

    /// Dynamic values to be interpolated (wrapped in escape())
    pub template_values: Vec<TemplateValue>,

    /// Whether this needs a hydration key
    pub needs_hydration_key: bool,

    /// Whether to skip escaping (for innerHTML, script, style)
    pub skip_escape: bool,

    /// Whether this contains a spread attribute
    pub has_spread: bool,

    /// The tag name (for native elements)
    pub tag_name: Option<String>,
}

/// A dynamic value in the SSR template
pub struct TemplateValue {
    /// The expression code
    pub expr: String,

    /// Whether this is an attribute value (uses different escaping)
    pub is_attr: bool,

    /// Whether to skip escaping entirely
    pub skip_escape: bool,
}

impl SSRResult {
    /// Create a new empty SSR result
    pub fn new() -> Self {
        Self::default()
    }

    /// Append static text to the template
    pub fn push_static(&mut self, text: &str) {
        if self.template_parts.is_empty() {
            self.template_parts.push(text.to_string());
        } else {
            let last = self.template_parts.last_mut().unwrap();
            last.push_str(text);
        }
    }

    /// Append a dynamic value
    pub fn push_dynamic(&mut self, expr: String, is_attr: bool, skip_escape: bool) {
        // Ensure we have a template part before this value
        if self.template_parts.len() == self.template_values.len() {
            self.template_parts.push(String::new());
        }
        self.template_values.push(TemplateValue {
            expr,
            is_attr,
            skip_escape,
        });
        // Add empty part for after this value
        self.template_parts.push(String::new());
    }

    /// Merge another SSR result into this one
    pub fn merge(&mut self, other: SSRResult) {
        for (i, part) in other.template_parts.into_iter().enumerate() {
            if i == 0 && !self.template_parts.is_empty() {
                // Merge first part with our last part
                self.template_parts.last_mut().unwrap().push_str(&part);
            } else {
                self.template_parts.push(part);
            }
        }
        self.template_values.extend(other.template_values);
    }

    /// Generate the final ssr tagged template call
    pub fn to_ssr_call(&self) -> String {
        if self.template_values.is_empty() {
            // No dynamic values, just return static string
            format!("\"{}\"", self.template_parts.join(""))
        } else {
            // Build ssr`...` tagged template
            let mut result = String::from("ssr`");

            for (i, part) in self.template_parts.iter().enumerate() {
                result.push_str(part);
                if i < self.template_values.len() {
                    let val = &self.template_values[i];
                    result.push_str("${");
                    if val.skip_escape {
                        result.push_str(&val.expr);
                    } else if val.is_attr {
                        result.push_str(&format!("escape({}, true)", val.expr));
                    } else {
                        result.push_str(&format!("escape({})", val.expr));
                    }
                    result.push('}');
                }
            }

            result.push('`');
            result
        }
    }
}

/// Context for SSR block transformation
#[derive(Default)]
pub struct SSRContext {
    /// Helper imports needed
    pub helpers: RefCell<IndexSet<String>>,

    /// Variable counter for unique names
    pub var_counter: RefCell<usize>,

    /// Whether we're in hydratable mode
    pub hydratable: bool,
}

impl SSRContext {
    pub fn new(hydratable: bool) -> Self {
        Self {
            helpers: RefCell::new(IndexSet::new()),
            var_counter: RefCell::new(0),
            hydratable,
        }
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
}
