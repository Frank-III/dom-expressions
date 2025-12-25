//! Main JSX transform logic
//! This implements the Traverse trait to walk the AST and transform JSX

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Expression, JSXElement, JSXFragment, JSXChild, JSXExpressionContainer,
    JSXText, Program,
};
use oxc_traverse::{Traverse, TraverseCtx, traverse_mut};
use oxc_semantic::SemanticBuilder;

use common::{TransformOptions, is_component, get_tag_name};

use crate::ir::{BlockContext, TransformResult};
use crate::element::transform_element;
use crate::component::transform_component;

/// The main Solid JSX transformer
pub struct SolidTransform<'a> {
    allocator: &'a Allocator,
    options: &'a TransformOptions<'a>,
    context: BlockContext,
}

impl<'a> SolidTransform<'a> {
    pub fn new(allocator: &'a Allocator, options: &'a TransformOptions<'a>) -> Self {
        Self {
            allocator,
            options,
            context: BlockContext::new(),
        }
    }

    /// Run the transform on a program
    pub fn transform(mut self, program: &mut Program<'a>) {
        // Store allocator as raw pointer to avoid borrow conflicts
        let allocator = self.allocator as *const Allocator;
        traverse_mut(
            &mut self,
            unsafe { &*allocator },
            program,
            SemanticBuilder::new()
                .build(program)
                .semantic
                .into_scoping(),
            (),
        );
    }

    /// Transform a JSX node and return the result
    fn transform_node(
        &self,
        node: &JSXChild<'a>,
        info: &TransformInfo,
    ) -> Option<TransformResult> {
        match node {
            JSXChild::Element(element) => {
                Some(self.transform_jsx_element(element, info))
            }
            JSXChild::Fragment(fragment) => {
                Some(self.transform_fragment(fragment, info))
            }
            JSXChild::Text(text) => {
                self.transform_text(text)
            }
            JSXChild::ExpressionContainer(container) => {
                self.transform_expression_container(container, info)
            }
            JSXChild::Spread(spread) => {
                // Spread children are rare, treat as dynamic
                Some(TransformResult {
                    exprs: vec![crate::ir::Expr {
                        code: format!("/* spread child */"),
                    }],
                    ..Default::default()
                })
            }
        }
    }

    /// Transform a JSX element
    fn transform_jsx_element(
        &self,
        element: &JSXElement<'a>,
        info: &TransformInfo,
    ) -> TransformResult {
        let tag_name = get_tag_name(element);

        if is_component(&tag_name) {
            transform_component(element, &tag_name, &self.context, self.options)
        } else {
            transform_element(element, &tag_name, info, &self.context, self.options)
        }
    }

    /// Transform a JSX fragment
    fn transform_fragment(
        &self,
        fragment: &JSXFragment<'a>,
        info: &TransformInfo,
    ) -> TransformResult {
        let mut result = TransformResult::default();

        for child in &fragment.children {
            if let Some(child_result) = self.transform_node(child, info) {
                // Merge child results
                result.template.push_str(&child_result.template);
                result.declarations.extend(child_result.declarations);
                result.exprs.extend(child_result.exprs);
                result.dynamics.extend(child_result.dynamics);
            }
        }

        result
    }

    /// Transform JSX text
    fn transform_text(&self, text: &JSXText<'a>) -> Option<TransformResult> {
        let content = common::expression::trim_whitespace(&text.value);
        if content.is_empty() {
            return None;
        }

        Some(TransformResult {
            template: common::expression::escape_html(&content, false),
            text: true,
            ..Default::default()
        })
    }

    /// Transform a JSX expression container
    fn transform_expression_container(
        &self,
        container: &JSXExpressionContainer<'a>,
        _info: &TransformInfo,
    ) -> Option<TransformResult> {
        // Use as_expression() to get the expression if it exists
        if let Some(expr) = container.expression.as_expression() {
            if common::is_dynamic(expr) {
                // Wrap in arrow function for reactivity
                Some(TransformResult {
                    exprs: vec![crate::ir::Expr {
                        code: format!("() => /* expr */"),
                    }],
                    ..Default::default()
                })
            } else {
                // Static expression
                Some(TransformResult {
                    exprs: vec![crate::ir::Expr {
                        code: format!("/* static expr */"),
                    }],
                    ..Default::default()
                })
            }
        } else {
            // Empty expression
            None
        }
    }
}

/// Additional info passed during transform
#[derive(Default, Clone)]
pub struct TransformInfo {
    pub top_level: bool,
    pub last_element: bool,
    pub skip_id: bool,
    pub component_child: bool,
    pub fragment_child: bool,
}

impl<'a> Traverse<'a, ()> for SolidTransform<'a> {
    fn enter_expression(
        &mut self,
        node: &mut Expression<'a>,
        ctx: &mut TraverseCtx<'a, ()>,
    ) {
        // Transform JSX elements and fragments
        match node {
            Expression::JSXElement(element) => {
                let result = self.transform_jsx_element(element, &TransformInfo {
                    top_level: true,
                    last_element: true,
                    ..Default::default()
                });
                // TODO: Replace node with generated code
            }
            Expression::JSXFragment(fragment) => {
                let result = self.transform_fragment(fragment, &TransformInfo {
                    top_level: true,
                    ..Default::default()
                });
                // TODO: Replace node with generated code
            }
            _ => {}
        }
    }

    fn exit_program(&mut self, program: &mut Program<'a>, ctx: &mut TraverseCtx<'a, ()>) {
        // Generate import statements for helpers
        // Generate template declarations
        // Generate delegate events call

        let helpers = self.context.helpers.borrow();
        let templates = self.context.templates.borrow();
        let delegates = self.context.delegates.borrow();

        // TODO: Insert generated statements at the top of the program
    }
}
