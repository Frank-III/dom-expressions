//! Template generation
//! Creates the _tmpl$ declarations and cloneNode calls

use crate::ir::{BlockContext, TransformResult};
use common::TransformOptions;

/// Generate template declaration
/// _tmpl$ = _template("<div>...</div>")
pub fn create_template_declaration(
    index: usize,
    content: &str,
    is_svg: bool,
    context: &BlockContext,
) -> String {
    context.register_helper("template");

    if is_svg {
        format!(
            "const _tmpl${} = _template(\"<svg>{}</svg>\", true);",
            index, content
        )
    } else {
        format!(
            "const _tmpl${} = _template(\"{}\");",
            index, content
        )
    }
}

/// Generate template clone expression
/// _tmpl$.cloneNode(true)
pub fn create_template_clone(index: usize) -> String {
    format!("_tmpl${}.cloneNode(true)", index)
}

/// Generate the full template creation code from a transform result
pub fn generate_template_code(
    result: &TransformResult,
    context: &BlockContext,
    _options: &TransformOptions,
) -> String {
    let mut code = String::new();

    // If we have a template, create the declaration
    if !result.template.is_empty() && !result.skip_template {
        let template_index = context.push_template(
            result.template.clone(),
            result.is_svg,
        );

        // Generate variable declarations
        if let Some(id) = &result.id {
            code.push_str(&format!(
                "const {} = {};\n",
                id,
                create_template_clone(template_index)
            ));
        }

        // Generate walker declarations for child elements
        for decl in &result.declarations {
            code.push_str(&format!(
                "const {} = {};\n",
                decl.name, decl.init
            ));
        }
    }

    // Generate effect wrapper for dynamics
    if !result.dynamics.is_empty() {
        context.register_helper("effect");

        for binding in &result.dynamics {
            code.push_str(&format!(
                "_effect(() => {});\n",
                generate_set_attr(&binding)
            ));
        }
    }

    // Generate expressions
    for expr in &result.exprs {
        code.push_str(&expr.code);
        code.push_str(";\n");
    }

    // Generate post expressions
    for expr in &result.post_exprs {
        code.push_str(&expr.code);
        code.push_str(";\n");
    }

    // Return the element
    if let Some(id) = &result.id {
        code.push_str(&format!("return {};\n", id));
    }

    code
}

/// Generate attribute setter expression
pub fn generate_set_attr(binding: &crate::ir::DynamicBinding) -> String {
    let key = &binding.key;
    let elem = &binding.elem;
    let value = &binding.value;

    // Handle special cases
    if key == "class" || key == "className" {
        if binding.is_svg {
            format!("{}.setAttribute(\"class\", {})", elem, value)
        } else {
            format!("{}.className = {}", elem, value)
        }
    } else if key == "style" {
        format!("style({}, {})", elem, value)
    } else if key == "classList" {
        format!("classList({}, {})", elem, value)
    } else if key == "textContent" || key == "innerText" {
        format!("{}.data = {}", elem, value)
    } else if common::constants::PROPERTIES.contains(key.as_str()) {
        format!("{}.{} = {}", elem, key, value)
    } else if binding.is_svg {
        format!("{}.setAttribute(\"{}\", {})", elem, key, value)
    } else {
        // Use setAttribute for unknown attributes
        format!("{}.setAttribute(\"{}\", {})", elem, key, value)
    }
}
