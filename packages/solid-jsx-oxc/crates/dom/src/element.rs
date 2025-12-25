//! Native element transform
//! Handles <div>, <span>, etc. -> template + effects

use oxc_ast::ast::{
    JSXElement, JSXAttribute, JSXAttributeItem, JSXAttributeName,
    JSXAttributeValue, JSXExpressionContainer,
};
use oxc_span::GetSpan;

use common::{
    TransformOptions, GenerateMode,
    is_svg_element, is_dynamic,
    constants::{PROPERTIES, CHILD_PROPERTIES, ALIASES, DELEGATED_EVENTS, VOID_ELEMENTS},
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

    // Generate element ID if needed
    if !info.skip_id {
        result.id = Some(context.generate_uid("el$"));
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
        transform_children(element, &mut result, context, options);

        // Close tag
        result.template.push_str(&format!("</{}>", tag_name));
        result.template_with_closing_tags.push_str(&format!("</{}>", tag_name));
    }

    result
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
                result.exprs.push(Expr {
                    code: format!(
                        "_spread({}, /* spread expr */, {}, {})",
                        elem_id,
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
                if is_dynamic(expr) {
                    // Dynamic - wrap in effect
                    result.dynamics.push(DynamicBinding {
                        elem: elem_id.to_string(),
                        key: key.clone(),
                        value: format!("/* dynamic expr */"),
                        is_svg: result.is_svg,
                        is_ce: result.has_custom_element,
                        tag_name: result.tag_name.clone().unwrap_or_default(),
                    });
                } else {
                    // Static expression - inline
                    let attr_key = ALIASES.get(key.as_str()).copied().unwrap_or(key.as_str());
                    result.template.push_str(&format!(" {}=\"/* static expr */\"", attr_key));
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
    context.register_helper("use");

    if let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value {
        // ref={myRef} or ref={el => myRef = el}
        result.exprs.push(Expr {
            code: format!("_use(/* ref */, {})", elem_id),
        });
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

    // Check if this event should be delegated
    let should_delegate = options.delegate_events
        && (DELEGATED_EVENTS.contains(event_name.as_str())
            || options.delegated_events.contains(&event_name.as_str()));

    if should_delegate {
        context.register_delegate(&event_name);
        result.exprs.push(Expr {
            code: format!("{}.$${}  = /* handler */", elem_id, event_name),
        });
    } else {
        context.register_helper("addEventListener");
        result.exprs.push(Expr {
            code: format!(
                "_addEventListener({}, \"{}\", /* handler */)",
                elem_id, event_name
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

    result.exprs.push(Expr {
        code: format!(
            "_use({}, {}, () => /* directive value */)",
            directive_name, elem_id
        ),
    });
}

/// Transform element children
fn transform_children<'a>(
    element: &JSXElement<'a>,
    result: &mut TransformResult,
    context: &BlockContext,
    options: &TransformOptions<'a>,
) {
    for child in &element.children {
        match child {
            oxc_ast::ast::JSXChild::Text(text) => {
                let content = common::expression::trim_whitespace(&text.value);
                if !content.is_empty() {
                    result.template.push_str(&escape_html(&content, false));
                }
            }
            oxc_ast::ast::JSXChild::Element(child_elem) => {
                // Recursively transform child elements
                let child_tag = common::get_tag_name(child_elem);
                let child_result = transform_element(
                    child_elem,
                    &child_tag,
                    &TransformInfo::default(),
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
                context.register_helper("insert");
                if let Some(id) = &result.id {
                    result.exprs.push(Expr {
                        code: format!("_insert({}, /* child expr */)", id),
                    });
                }
            }
            _ => {}
        }
    }
}
