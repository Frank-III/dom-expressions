//! SSR element transform
//!
//! Transforms native HTML elements into SSR template strings.
//! Unlike DOM, we don't create DOM nodes - we build strings.

use oxc_ast::ast::{
    JSXElement, JSXAttribute, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue,
};

use common::{
    TransformOptions,
    is_svg_element, expr_to_string,
    constants::{PROPERTIES, CHILD_PROPERTIES, ALIASES, VOID_ELEMENTS},
    expression::escape_html,
};

use crate::ir::{SSRContext, SSRResult};

/// Transform a native HTML/SVG element for SSR
pub fn transform_element<'a>(
    element: &JSXElement<'a>,
    tag_name: &str,
    context: &SSRContext,
    options: &TransformOptions<'a>,
) -> SSRResult {
    let is_void = VOID_ELEMENTS.contains(tag_name);
    let is_script_or_style = tag_name == "script" || tag_name == "style";

    let mut result = SSRResult::new();
    result.tag_name = Some(tag_name.to_string());
    result.skip_escape = is_script_or_style;

    // Check for spread attributes - need different handling
    let has_spread = element.opening_element.attributes.iter().any(|a| {
        matches!(a, JSXAttributeItem::SpreadAttribute(_))
    });

    if has_spread {
        return transform_element_with_spread(element, tag_name, context, options);
    }

    // Start the tag
    result.push_static(&format!("<{}", tag_name));

    // Add hydration key if needed
    if context.hydratable && options.hydratable {
        context.register_helper("ssrHydrationKey");
        result.push_dynamic("ssrHydrationKey()".to_string(), false, true);
    }

    // Transform attributes
    transform_attributes(element, &mut result, context, options);

    // Close opening tag
    result.push_static(">");

    // Transform children (if not void element)
    if !is_void {
        transform_children(element, &mut result, context, options);
        result.push_static(&format!("</{}>", tag_name));
    }

    result
}

/// Transform element with spread attributes using ssrElement()
fn transform_element_with_spread<'a>(
    element: &JSXElement<'a>,
    tag_name: &str,
    context: &SSRContext,
    options: &TransformOptions<'a>,
) -> SSRResult {
    context.register_helper("ssrElement");
    context.register_helper("escape");
    context.register_helper("mergeProps");

    let mut result = SSRResult::new();
    result.has_spread = true;

    // Build the props - collect spreads and regular attributes
    let mut props_parts: Vec<String> = Vec::new();

    for attr in &element.opening_element.attributes {
        match attr {
            JSXAttributeItem::SpreadAttribute(spread) => {
                // Add spread directly
                let expr_str = expr_to_string(&spread.argument);
                props_parts.push(expr_str);
            }
            JSXAttributeItem::Attribute(attr) => {
                let key = match &attr.name {
                    JSXAttributeName::Identifier(id) => id.name.to_string(),
                    JSXAttributeName::NamespacedName(ns) => {
                        format!("{}:{}", ns.namespace.name, ns.name.name)
                    }
                };

                // Skip client-only attributes
                if key == "ref" || key.starts_with("on") || key.starts_with("use:") || key.starts_with("prop:") {
                    continue;
                }

                // Handle aliases
                let attr_name = if is_svg_element(tag_name) {
                    key.clone()
                } else {
                    ALIASES.get(key.as_str()).copied().unwrap_or(&key).to_string()
                };

                let value_str = match &attr.value {
                    Some(JSXAttributeValue::StringLiteral(lit)) => {
                        format!("\"{}\"", escape_html(&lit.value, true))
                    }
                    Some(JSXAttributeValue::ExpressionContainer(container)) => {
                        if let Some(expr) = container.expression.as_expression() {
                            expr_to_string(expr)
                        } else {
                            "undefined".to_string()
                        }
                    }
                    None => "true".to_string(),
                    _ => "undefined".to_string(),
                };

                props_parts.push(format!("{{ \"{}\": {} }}", attr_name, value_str));
            }
        }
    }

    // Build merged props expression
    let props_expr = if props_parts.is_empty() {
        "{}".to_string()
    } else if props_parts.len() == 1 {
        props_parts.into_iter().next().unwrap()
    } else {
        format!("mergeProps({})", props_parts.join(", "))
    };

    // Build children
    let is_void = VOID_ELEMENTS.contains(tag_name);
    let children_expr = if is_void || element.children.is_empty() {
        "undefined".to_string()
    } else {
        build_children_expr(element, context, options)
    };

    // Generate: ssrElement("tag", props, children, needsHydrationKey)
    result.push_dynamic(
        format!(
            "ssrElement(\"{}\", {}, {}, {})",
            tag_name,
            props_expr,
            children_expr,
            context.hydratable && options.hydratable
        ),
        false,
        true,
    );

    result
}

/// Build children expression for ssrElement
fn build_children_expr<'a>(
    element: &JSXElement<'a>,
    context: &SSRContext,
    _options: &TransformOptions<'a>,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    for child in &element.children {
        match child {
            oxc_ast::ast::JSXChild::Text(text) => {
                let content = common::expression::trim_whitespace(&text.value);
                if !content.is_empty() {
                    parts.push(format!("\"{}\"", escape_html(&content, false)));
                }
            }
            oxc_ast::ast::JSXChild::ExpressionContainer(container) => {
                if let Some(expr) = container.expression.as_expression() {
                    let expr_str = expr_to_string(expr);
                    context.register_helper("escape");
                    parts.push(format!("escape({})", expr_str));
                }
            }
            oxc_ast::ast::JSXChild::Element(child_elem) => {
                let child_tag = common::get_tag_name(child_elem);
                if common::is_component(&child_tag) {
                    context.register_helper("createComponent");
                    // Simple component call - would need full transform for complex cases
                    parts.push(format!("createComponent({}, {{}})", child_tag));
                } else {
                    // For nested elements with spread, we'd need to recursively build
                    // For now, generate an ssr template string
                    context.register_helper("ssr");
                    parts.push(format!("ssr`<{}></{}>` ", child_tag, child_tag));
                }
            }
            _ => {}
        }
    }

    if parts.is_empty() {
        "undefined".to_string()
    } else if parts.len() == 1 {
        parts.into_iter().next().unwrap()
    } else {
        format!("[{}].join(\"\")", parts.join(", "))
    }
}

/// Transform element attributes for SSR
fn transform_attributes<'a>(
    element: &JSXElement<'a>,
    result: &mut SSRResult,
    context: &SSRContext,
    options: &TransformOptions<'a>,
) {
    let tag_name = result.tag_name.as_deref().unwrap_or("");
    let is_svg = is_svg_element(tag_name);

    for attr in &element.opening_element.attributes {
        if let JSXAttributeItem::Attribute(attr) = attr {
            transform_attribute(attr, result, context, options, is_svg);
        }
    }
}

/// Transform a single attribute for SSR
fn transform_attribute<'a>(
    attr: &JSXAttribute<'a>,
    result: &mut SSRResult,
    context: &SSRContext,
    _options: &TransformOptions<'a>,
    is_svg: bool,
) {
    let key = match &attr.name {
        JSXAttributeName::Identifier(id) => id.name.to_string(),
        JSXAttributeName::NamespacedName(ns) => {
            format!("{}:{}", ns.namespace.name, ns.name.name)
        }
    };

    // Skip client-only attributes
    if key == "ref" || key.starts_with("on") || key.starts_with("use:") || key.starts_with("prop:") {
        return;
    }

    // Handle child properties (innerHTML, textContent)
    if CHILD_PROPERTIES.contains(key.as_str()) {
        // These are handled in children transform
        return;
    }

    // Get the attribute name (handle aliases like className -> class)
    let attr_name = if is_svg {
        key.clone()
    } else {
        ALIASES.get(key.as_str()).copied().unwrap_or(&key).to_string()
    };

    match &attr.value {
        // Static string value
        Some(JSXAttributeValue::StringLiteral(lit)) => {
            let escaped = escape_html(&lit.value, true);
            result.push_static(&format!(" {}=\"{}\"", attr_name, escaped));
        }

        // Dynamic value
        Some(JSXAttributeValue::ExpressionContainer(container)) => {
            if let Some(expr) = container.expression.as_expression() {
                let expr_str = expr_to_string(expr);
                context.register_helper("escape");

                // Handle special attributes
                if key == "style" {
                    context.register_helper("ssrStyle");
                    result.push_static(&format!(" {}=\"", attr_name));
                    result.push_dynamic(format!("ssrStyle({})", expr_str), false, true);
                    result.push_static("\"");
                } else if key == "class" || key == "className" {
                    result.push_static(&format!(" {}=\"", attr_name));
                    result.push_dynamic(expr_str, true, false);
                    result.push_static("\"");
                } else if key == "classList" {
                    context.register_helper("ssrClassList");
                    result.push_static(" class=\"");
                    result.push_dynamic(format!("ssrClassList({})", expr_str), false, true);
                    result.push_static("\"");
                } else if PROPERTIES.contains(key.as_str()) {
                    // Boolean attributes
                    context.register_helper("ssrAttribute");
                    result.push_dynamic(
                        format!("ssrAttribute(\"{}\", {}, true)", attr_name, expr_str),
                        false,
                        true,
                    );
                } else {
                    // Regular attribute
                    result.push_static(&format!(" {}=\"", attr_name));
                    result.push_dynamic(expr_str, true, false);
                    result.push_static("\"");
                }
            }
        }

        // Boolean attribute (no value)
        None => {
            result.push_static(&format!(" {}", attr_name));
        }

        _ => {}
    }
}

/// Transform element children for SSR
fn transform_children<'a>(
    element: &JSXElement<'a>,
    result: &mut SSRResult,
    context: &SSRContext,
    options: &TransformOptions<'a>,
) {
    // Check for innerHTML/textContent in attributes first
    for attr in &element.opening_element.attributes {
        if let JSXAttributeItem::Attribute(attr) = attr {
            let key = match &attr.name {
                JSXAttributeName::Identifier(id) => id.name.as_str(),
                _ => continue,
            };

            if key == "innerHTML" {
                if let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value {
                    if let Some(expr) = container.expression.as_expression() {
                        // innerHTML - don't escape
                        result.push_dynamic(expr_to_string(expr), false, true);
                        return;
                    }
                }
            } else if key == "textContent" || key == "innerText" {
                if let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value {
                    if let Some(expr) = container.expression.as_expression() {
                        context.register_helper("escape");
                        result.push_dynamic(expr_to_string(expr), false, false);
                        return;
                    }
                }
            }
        }
    }

    // Process children
    for child in &element.children {
        match child {
            oxc_ast::ast::JSXChild::Text(text) => {
                let content = common::expression::trim_whitespace(&text.value);
                if !content.is_empty() {
                    if result.skip_escape {
                        result.push_static(&content);
                    } else {
                        result.push_static(&escape_html(&content, false));
                    }
                }
            }

            oxc_ast::ast::JSXChild::Element(child_elem) => {
                let child_tag = common::get_tag_name(child_elem);
                let child_result = if common::is_component(&child_tag) {
                    // Create a child transformer for nested components
                    let child_transformer = |child: &oxc_ast::ast::JSXChild<'a>| -> Option<SSRResult> {
                        match child {
                            oxc_ast::ast::JSXChild::Element(el) => {
                                let tag = common::get_tag_name(el);
                                Some(if common::is_component(&tag) {
                                    // For deeply nested components, use simple fallback
                                    let mut r = SSRResult::new();
                                    r.push_dynamic(format!("createComponent({}, {{}})", tag), false, false);
                                    r
                                } else {
                                    transform_element(el, &tag, context, options)
                                })
                            }
                            _ => None,
                        }
                    };
                    crate::component::transform_component(child_elem, &child_tag, context, options, &child_transformer)
                } else {
                    transform_element(child_elem, &child_tag, context, options)
                };
                result.merge(child_result);
            }

            oxc_ast::ast::JSXChild::ExpressionContainer(container) => {
                if let Some(expr) = container.expression.as_expression() {
                    let expr_str = expr_to_string(expr);
                    context.register_helper("escape");

                    if result.skip_escape {
                        // Inside script/style - don't escape
                        result.push_dynamic(expr_str, false, true);
                    } else {
                        // Normal content - escape
                        result.push_dynamic(expr_str, false, false);
                    }
                }
            }

            oxc_ast::ast::JSXChild::Fragment(fragment) => {
                // Recursively process fragment children
                for frag_child in &fragment.children {
                    match frag_child {
                        oxc_ast::ast::JSXChild::Text(text) => {
                            let content = common::expression::trim_whitespace(&text.value);
                            if !content.is_empty() {
                                if result.skip_escape {
                                    result.push_static(&content);
                                } else {
                                    result.push_static(&escape_html(&content, false));
                                }
                            }
                        }
                        oxc_ast::ast::JSXChild::Element(child_elem) => {
                            let child_tag = common::get_tag_name(child_elem);
                            let child_result = if common::is_component(&child_tag) {
                                let child_transformer = |child: &oxc_ast::ast::JSXChild<'a>| -> Option<SSRResult> {
                                    match child {
                                        oxc_ast::ast::JSXChild::Element(el) => {
                                            let tag = common::get_tag_name(el);
                                            Some(if common::is_component(&tag) {
                                                let mut r = SSRResult::new();
                                                r.push_dynamic(format!("createComponent({}, {{}})", tag), false, false);
                                                r
                                            } else {
                                                transform_element(el, &tag, context, options)
                                            })
                                        }
                                        _ => None,
                                    }
                                };
                                crate::component::transform_component(child_elem, &child_tag, context, options, &child_transformer)
                            } else {
                                transform_element(child_elem, &child_tag, context, options)
                            };
                            result.merge(child_result);
                        }
                        oxc_ast::ast::JSXChild::ExpressionContainer(container) => {
                            if let Some(expr) = container.expression.as_expression() {
                                let expr_str = expr_to_string(expr);
                                context.register_helper("escape");
                                if result.skip_escape {
                                    result.push_dynamic(expr_str, false, true);
                                } else {
                                    result.push_dynamic(expr_str, false, false);
                                }
                            }
                        }
                        // Nested fragments - recurse
                        oxc_ast::ast::JSXChild::Fragment(_) | oxc_ast::ast::JSXChild::Spread(_) => {
                            // For deeply nested fragments/spreads, we'd need recursion
                            // For now, skip to avoid infinite loops
                        }
                    }
                }
            }

            _ => {}
        }
    }
}
