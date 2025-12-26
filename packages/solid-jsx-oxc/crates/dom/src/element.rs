//! Native element transform
//! Handles <div>, <span>, etc. -> template + effects

use oxc_ast::ast::{
    JSXElement, JSXAttribute, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue,
};

use common::{
    TransformOptions,
    is_svg_element, is_dynamic, expr_to_string,
    constants::{ALIASES, DELEGATED_EVENTS, VOID_ELEMENTS},
    expression::{escape_html, to_event_name},
};

use crate::ir::{BlockContext, TransformResult, Declaration, Expr, DynamicBinding};
use crate::transform::TransformInfo;

/// Transform a native HTML/SVG element
pub fn transform_element<'a>(
    element: &JSXElement<'a>,
    tag_name: &str,
    info: &TransformInfo,
    context: &BlockContext,
    options: &TransformOptions<'a>,
) -> TransformResult {
    let is_svg = is_svg_element(tag_name);
    let is_void = VOID_ELEMENTS.contains(tag_name);
    let is_custom_element = tag_name.contains('-');

    let mut result = TransformResult {
        tag_name: Some(tag_name.to_string()),
        is_svg,
        has_custom_element: is_custom_element,
        ..Default::default()
    };

    // Check if this element needs runtime access (dynamic attributes, refs, events)
    let needs_runtime_access = element_needs_runtime_access(element);

    // Generate element ID if needed
    if !info.skip_id && (info.top_level || needs_runtime_access) {
        let elem_id = context.generate_uid("el$");
        result.id = Some(elem_id.clone());

        // If we have a path, we need to walk to this element
        if !info.path.is_empty() {
            if let Some(root_id) = &info.root_id {
                let walk_expr = info.path.iter()
                    .fold(root_id.clone(), |acc, step| format!("{}.{}", acc, step));
                result.declarations.push(Declaration {
                    name: elem_id.clone(),
                    init: walk_expr,
                });
            }
        }
    }

    // Start building template
    result.template = format!("<{}", tag_name);
    result.template_with_closing_tags = result.template.clone();

    // Transform attributes
    transform_attributes(element, &mut result, context, options);

    // Close opening tag
    result.template.push('>');
    result.template_with_closing_tags.push('>');

    // Transform children (if not void element)
    if !is_void {
        // Pass down the root ID and path for children
        let child_info = TransformInfo {
            root_id: if info.top_level {
                result.id.clone()
            } else {
                info.root_id.clone()
            },
            ..info.clone()
        };
        transform_children(element, &mut result, &child_info, context, options);

        // Close tag
        result.template.push_str(&format!("</{}>", tag_name));
        result.template_with_closing_tags.push_str(&format!("</{}>", tag_name));
    }

    result
}

/// Check if an element needs runtime access
fn element_needs_runtime_access(element: &JSXElement) -> bool {
    for attr in &element.opening_element.attributes {
        match attr {
            JSXAttributeItem::Attribute(attr) => {
                let key = match &attr.name {
                    JSXAttributeName::Identifier(id) => id.name.as_str(),
                    JSXAttributeName::NamespacedName(ns) => {
                        // Namespaced attributes like on:click or use:directive always need access
                        return true;
                    }
                };

                // ref needs access
                if key == "ref" {
                    return true;
                }

                // Event handlers need access
                if key.starts_with("on") && key.len() > 2 {
                    return true;
                }

                // Check if attribute value is dynamic
                if let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value {
                    if let Some(expr) = container.expression.as_expression() {
                        if is_dynamic(expr) {
                            return true;
                        }
                    }
                }
            }
            JSXAttributeItem::SpreadAttribute(_) => {
                // Spread attributes always need runtime access
                return true;
            }
        }
    }
    false
}

/// Transform element attributes
fn transform_attributes<'a>(
    element: &JSXElement<'a>,
    result: &mut TransformResult,
    context: &BlockContext,
    options: &TransformOptions<'a>,
) {
    let elem_id = result.id.clone().unwrap_or_else(|| context.generate_uid("el$"));

    for attr in &element.opening_element.attributes {
        match attr {
            JSXAttributeItem::Attribute(attr) => {
                transform_attribute(attr, &elem_id, result, context, options);
            }
            JSXAttributeItem::SpreadAttribute(spread) => {
                // Handle {...props} spread
                context.register_helper("spread");
                let spread_expr = expr_to_string(&spread.argument);
                result.exprs.push(Expr {
                    code: format!(
                        "spread({}, {}, {}, {})",
                        elem_id,
                        spread_expr,
                        result.is_svg,
                        !element.children.is_empty()
                    ),
                });
            }
        }
    }
}

/// Transform a single attribute
fn transform_attribute<'a>(
    attr: &JSXAttribute<'a>,
    elem_id: &str,
    result: &mut TransformResult,
    context: &BlockContext,
    options: &TransformOptions<'a>,
) {
    let key = match &attr.name {
        JSXAttributeName::Identifier(id) => id.name.to_string(),
        JSXAttributeName::NamespacedName(ns) => {
            format!("{}:{}", ns.namespace.name, ns.name.name)
        }
    };

    // Handle different attribute types
    if key == "ref" {
        transform_ref(attr, elem_id, result, context);
        return;
    }

    if key.starts_with("on") {
        transform_event(attr, &key, elem_id, result, context, options);
        return;
    }

    if key.starts_with("use:") {
        transform_directive(attr, &key, elem_id, result, context);
        return;
    }

    // Regular attribute
    match &attr.value {
        Some(JSXAttributeValue::StringLiteral(lit)) => {
            // Static string attribute - inline in template
            let attr_key = ALIASES.get(key.as_str()).copied().unwrap_or(key.as_str());
            let escaped = escape_html(&lit.value, true);
            result.template.push_str(&format!(" {}=\"{}\"", attr_key, escaped));
        }
        Some(JSXAttributeValue::ExpressionContainer(container)) => {
            // Dynamic attribute - needs effect
            if let Some(expr) = container.expression.as_expression() {
                let expr_str = expr_to_string(expr);
                if is_dynamic(expr) {
                    // Dynamic - wrap in effect
                    result.dynamics.push(DynamicBinding {
                        elem: elem_id.to_string(),
                        key: key.clone(),
                        value: expr_str,
                        is_svg: result.is_svg,
                        is_ce: result.has_custom_element,
                        tag_name: result.tag_name.clone().unwrap_or_default(),
                    });
                } else {
                    // Static expression - we need to evaluate it at build time
                    // For now, treat as dynamic to be safe
                    result.dynamics.push(DynamicBinding {
                        elem: elem_id.to_string(),
                        key: key.clone(),
                        value: expr_str,
                        is_svg: result.is_svg,
                        is_ce: result.has_custom_element,
                        tag_name: result.tag_name.clone().unwrap_or_default(),
                    });
                }
            }
        }
        None => {
            // Boolean attribute (e.g., disabled)
            result.template.push_str(&format!(" {}", key));
        }
        _ => {}
    }
}

/// Transform ref attribute
fn transform_ref<'a>(
    attr: &JSXAttribute<'a>,
    elem_id: &str,
    result: &mut TransformResult,
    context: &BlockContext,
) {
    if let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value {
        if let Some(expr) = container.expression.as_expression() {
            let ref_expr = expr_to_string(expr);
            // Check if it's a function or a variable
            if ref_expr.contains("=>") || ref_expr.starts_with("(") {
                // It's a callback: ref={el => myRef = el}
                result.exprs.push(Expr {
                    code: format!("typeof {} === \"function\" ? {}({}) : {} = {}",
                        ref_expr, ref_expr, elem_id, ref_expr, elem_id),
                });
            } else {
                // It's a variable: ref={myRef}
                result.exprs.push(Expr {
                    code: format!("{} = {}", ref_expr, elem_id),
                });
            }
        }
    }
}

/// Transform event handler
fn transform_event<'a>(
    attr: &JSXAttribute<'a>,
    key: &str,
    elem_id: &str,
    result: &mut TransformResult,
    context: &BlockContext,
    options: &TransformOptions<'a>,
) {
    let event_name = to_event_name(key);

    // Get the handler expression
    let handler = if let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value {
        container.expression.as_expression()
            .map(|e| expr_to_string(e))
            .unwrap_or_else(|| "undefined".to_string())
    } else {
        "undefined".to_string()
    };

    // Check if this event should be delegated
    let should_delegate = options.delegate_events
        && (DELEGATED_EVENTS.contains(event_name.as_str())
            || options.delegated_events.contains(&event_name.as_str()));

    if should_delegate {
        context.register_delegate(&event_name);
        result.exprs.push(Expr {
            code: format!("{}.$${} = {}", elem_id, event_name, handler),
        });
    } else {
        context.register_helper("addEventListener");
        result.exprs.push(Expr {
            code: format!(
                "addEventListener({}, \"{}\", {}, false)",
                elem_id, event_name, handler
            ),
        });
    }
}

/// Transform use: directive
fn transform_directive<'a>(
    attr: &JSXAttribute<'a>,
    key: &str,
    elem_id: &str,
    result: &mut TransformResult,
    context: &BlockContext,
) {
    context.register_helper("use");
    let directive_name = &key[4..]; // Strip "use:"

    let value = if let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value {
        container.expression.as_expression()
            .map(|e| format!("() => {}", expr_to_string(e)))
            .unwrap_or_else(|| "undefined".to_string())
    } else {
        "undefined".to_string()
    };

    result.exprs.push(Expr {
        code: format!(
            "use({}, {}, {})",
            directive_name, elem_id, value
        ),
    });
}

/// Transform element children
fn transform_children<'a>(
    element: &JSXElement<'a>,
    result: &mut TransformResult,
    info: &TransformInfo,
    context: &BlockContext,
    options: &TransformOptions<'a>,
) {
    let mut is_first_element = true;

    for child in &element.children {
        match child {
            oxc_ast::ast::JSXChild::Text(text) => {
                let content = common::expression::trim_whitespace(&text.value);
                if !content.is_empty() {
                    result.template.push_str(&escape_html(&content, false));
                    // Text nodes count as firstChild but we track element children separately
                }
            }
            oxc_ast::ast::JSXChild::Element(child_elem) => {
                // Build the path for this child element
                let mut child_path = info.path.clone();
                if is_first_element {
                    child_path.push("firstChild".to_string());
                } else {
                    child_path.push("nextSibling".to_string());
                }
                is_first_element = false;

                let child_info = TransformInfo {
                    top_level: false,
                    path: child_path,
                    root_id: info.root_id.clone(),
                    ..info.clone()
                };

                // Recursively transform child elements
                let child_tag = common::get_tag_name(child_elem);
                let child_result = transform_element(
                    child_elem,
                    &child_tag,
                    &child_info,
                    context,
                    options,
                );
                result.template.push_str(&child_result.template);
                result.declarations.extend(child_result.declarations);
                result.exprs.extend(child_result.exprs);
                result.dynamics.extend(child_result.dynamics);
            }
            oxc_ast::ast::JSXChild::ExpressionContainer(container) => {
                // Dynamic child - needs insert
                if let Some(expr) = container.expression.as_expression() {
                    context.register_helper("insert");
                    let child_expr = expr_to_string(expr);
                    if let Some(id) = &result.id {
                        // Check if it's a reactive expression
                        if is_dynamic(expr) {
                            result.exprs.push(Expr {
                                code: format!("insert({}, () => {})", id, child_expr),
                            });
                        } else {
                            result.exprs.push(Expr {
                                code: format!("insert({}, {})", id, child_expr),
                            });
                        }
                    }
                }
            }
            _ => {}
        }
    }
}
