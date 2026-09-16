tool_args!(GitDiffArgs {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    staged: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    stat: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(flatten, default)]
    options: chatcmd_runtime::GitRunOptions
});
tool_args!(GitLogArgs {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(flatten, default)]
    options: chatcmd_runtime::GitRunOptions
});
#[derive(Debug, Clone, Default, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SubagentApprovalGrantArgs {
    /// Distinct names from subagentPolicy.approvalGrant.allowedTools only. Git/process and
    /// agent_* lifecycle tools are ineligible. This is NOT the child's tool allowlist.
    /// Omit approvalGrant unless an approved parent safe-read grant can cover it.
    allowed_tools: Vec<String>,
    path_scopes: Vec<String>,
    max_calls: u64,
    max_files_scanned: u64,
    max_bytes_read: u64,
}
tool_args!(SubagentStartArgs {
    name: String,
    request: String,
    /// Optional visible ChatGPT model label for browser-extension children. Supplying a
    /// concrete model selects the browser route so the coordinator can separate worker roles.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    /// Optional visible ChatGPT reasoning-effort label for browser-extension children, such as
    /// Instant, Medium, or High. Supplying it selects the browser route even when model is Auto.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    allowed_files: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    allowed_effects: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    dependencies: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    acceptance: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    project_context_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    instructions_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    approval_grant: Option<SubagentApprovalGrantArgs>
});
tool_args!(SubagentWaitArgs {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    timeout_ms: Option<u64>,
    /// Optional descendant ID to read a report page without waiting for other children.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    subagent_id: Option<String>,
    /// Zero-based Unicode character offset returned by report.continuation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    report_offset: Option<u64>,
    /// Immutable final event ID from report.continuation; required for offsets above zero.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    report_version: Option<String>
});

#[cfg(test)]
mod fleet_model_contract_tests {
    use super::*;

    #[test]
    fn subagent_start_accepts_visible_model_and_reasoning_labels() {
        let input = serde_json::from_value::<SubagentStartArgs>(serde_json::json!({
            "name": "independent-reviewer",
            "request": "Review exact candidate",
            "model": "GPT-5.6 Sol",
            "reasoning": "High"
        }))
        .expect("routing fields should be part of the public delegation contract");
        assert_eq!(input.model.as_deref(), Some("GPT-5.6 Sol"));
        assert_eq!(input.reasoning.as_deref(), Some("High"));
    }

    #[test]
    fn subagent_start_schema_advertises_routing_fields() {
        let schema = serde_json::to_value(schemars::schema_for!(SubagentStartArgs))
            .expect("subagent schema should serialize")
            .to_string();
        assert!(schema.contains("model"));
        assert!(schema.contains("reasoning"));
    }
}
