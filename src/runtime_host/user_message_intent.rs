pub(super) fn is_plan_mode_request(content: &str) -> bool {
    let normalized = intent_prose(content)
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let negated = [
        "do not plan",
        "don't plan",
        "no plan needed",
        "skip planning",
        "do not make a plan",
        "don't make a plan",
    ]
    .iter()
    .any(|phrase| normalized.contains(phrase));
    !negated
        && (normalized.contains("make a plan")
            || normalized.contains("create a plan")
            || normalized.contains("plan this")
            || normalized.split_whitespace().any(|word| word == "#plan"))
}

fn intent_prose(content: &str) -> String {
    let mut prose = String::with_capacity(content.len());
    let mut fenced = false;
    for line in content.lines() {
        if line.trim_start().starts_with("```") {
            fenced = !fenced;
            continue;
        }
        if fenced {
            continue;
        }
        let mut delimiter = None;
        for character in line.chars() {
            if matches!(character, '`' | '"' | '\'') {
                delimiter = match delimiter {
                    Some(active) if active == character => None,
                    None => Some(character),
                    active => active,
                };
            } else if delimiter.is_none() {
                prose.push(character);
            }
        }
        prose.push(' ');
    }
    prose
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planning_trigger_ignores_negation_quotes_and_code() {
        assert!(is_plan_mode_request("Make a plan for buying a gift"));
        assert!(is_plan_mode_request("CREATE   A PLAN\nfor the storefront"));
        assert!(is_plan_mode_request("Plan this website migration"));
        assert!(is_plan_mode_request("Build the website for me #PLAN"));
        assert!(!is_plan_mode_request("Show me the current plan"));
        assert!(!is_plan_mode_request("Use the planner to track the work"));
        assert!(!is_plan_mode_request("No plan needed; fix it now"));
        assert!(!is_plan_mode_request("Don't make a plan; implement directly"));
        assert!(!is_plan_mode_request("The log contains `#plan`, but fix the bug"));
        assert!(!is_plan_mode_request(
            "Example:\n```text\nmake a plan\n```\nFix the code"
        ));
        assert!(!is_plan_mode_request("Review the phrase \"make a plan\""));
    }
}
