//! Check functions for JSX nodes
//! Ported from dom-expressions/src/shared/utils.js

use oxc_ast::ast::{JSXElement, JSXElementName, JSXMemberExpression, JSXMemberExpressionObject, Expression};

use crate::constants::{BUILT_INS, SVG_ELEMENTS};

/// Check if a tag name represents a component (starts with uppercase or contains dot)
pub fn is_component(tag: &str) -> bool {
    if tag.is_empty() {
        return false;
    }
    let first_char = tag.chars().next().unwrap();
    first_char.is_uppercase() || tag.contains('.')
}

/// Check if this is a built-in Solid component (For, Show, etc.)
pub fn is_built_in(tag: &str) -> bool {
    BUILT_INS.contains(tag)
}

/// Check if this is an SVG element
pub fn is_svg_element(tag: &str) -> bool {
    SVG_ELEMENTS.contains(tag)
}

/// Get the tag name from a JSX element
pub fn get_tag_name(element: &JSXElement) -> String {
    get_jsx_element_name(&element.opening_element.name)
}

/// Get the name from a JSXElementName
fn get_jsx_element_name(name: &JSXElementName) -> String {
    match name {
        JSXElementName::Identifier(id) => id.name.to_string(),
        JSXElementName::IdentifierReference(id) => id.name.to_string(),
        JSXElementName::NamespacedName(ns) => {
            format!("{}:{}", ns.namespace.name, ns.name.name)
        }
        JSXElementName::MemberExpression(member) => {
            get_member_expression_name(member)
        }
        JSXElementName::ThisExpression(_) => "this".to_string(),
    }
}

/// Get the name from a JSX member expression (e.g., Foo.Bar.Baz)
fn get_member_expression_name(member: &JSXMemberExpression) -> String {
    let object = match &member.object {
        JSXMemberExpressionObject::IdentifierReference(id) => id.name.to_string(),
        JSXMemberExpressionObject::MemberExpression(m) => {
            get_member_expression_name(m)
        }
        JSXMemberExpressionObject::ThisExpression(_) => "this".to_string(),
    };
    format!("{}.{}", object, member.property.name)
}

/// Check if an expression is dynamic (needs effect wrapping)
/// This is a simplified version - full implementation would need scope analysis
pub fn is_dynamic(expr: &Expression) -> bool {
    match expr {
        // Literals are static
        Expression::StringLiteral(_)
        | Expression::NumericLiteral(_)
        | Expression::BooleanLiteral(_)
        | Expression::NullLiteral(_) => false,

        // Template literals with no expressions are static
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => false,

        // Function calls are dynamic
        Expression::CallExpression(_) => true,

        // Member expressions accessing reactive values are dynamic
        Expression::StaticMemberExpression(_)
        | Expression::ComputedMemberExpression(_) => true,

        // Identifiers need scope analysis, assume dynamic for now
        Expression::Identifier(_) => true,

        // Conditional expressions are dynamic
        Expression::ConditionalExpression(_)
        | Expression::LogicalExpression(_) => true,

        // Binary/unary with dynamic operands
        Expression::BinaryExpression(b) => {
            is_dynamic(&b.left) || is_dynamic(&b.right)
        }
        Expression::UnaryExpression(u) => is_dynamic(&u.argument),

        // Arrow functions themselves are static (the reference)
        Expression::ArrowFunctionExpression(_)
        | Expression::FunctionExpression(_) => false,

        // Object/array literals depend on their contents
        Expression::ObjectExpression(o) => {
            o.properties.iter().any(|p| {
                match p {
                    oxc_ast::ast::ObjectPropertyKind::ObjectProperty(prop) => {
                        is_dynamic(&prop.value)
                    }
                    oxc_ast::ast::ObjectPropertyKind::SpreadProperty(spread) => {
                        is_dynamic(&spread.argument)
                    }
                }
            })
        }
        Expression::ArrayExpression(a) => {
            a.elements.iter().any(|el| {
                match el {
                    oxc_ast::ast::ArrayExpressionElement::SpreadElement(s) => {
                        is_dynamic(&s.argument)
                    }
                    oxc_ast::ast::ArrayExpressionElement::Elision(_) => false,
                    _ => {
                        if let Some(expr) = el.as_expression() {
                            is_dynamic(expr)
                        } else {
                            false
                        }
                    }
                }
            })
        }

        // Default to dynamic for safety
        _ => true,
    }
}
