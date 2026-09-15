fn into_tool_arguments<T: Serialize>(arguments: T) -> ToolArguments {
    serde_json::from_value(serde_json::to_value(arguments).expect("typed MCP arguments serialize"))
        .expect("typed MCP arguments convert to shared envelope")
}

/// Cloneable rmcp handler backed by injected services.
#[derive(Clone)]
pub struct McpServer {
    runtime: Arc<dyn RuntimeApi>,
}

impl McpServer {
    #[must_use]
    pub fn new(runtime: Arc<dyn RuntimeApi>) -> Self {
        Self { runtime }
    }

    fn prepare_call(
        &self,
        tool_name: &'static str,
        arguments: ToolArguments,
        authenticated: request_identity::AuthenticatedMcpContext,
    ) -> (OperationContext, Value) {
        let request_id = if arguments.request_id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            arguments.request_id.clone()
        };
        let mut context = OperationContext::new(request_id, authenticated.agent_id, tool_name);
        context.task_id = arguments.task_id;
        context.turn_id = arguments.turn_id;
        context.mcp_session_id = Some(authenticated.local_session_id);
        context.conversation_scope_id = authenticated.conversation_scope_id;
        let value = Value::Object(arguments.fields.into_iter().collect());
        (context, value)
    }

    async fn invoke(
        &self,
        tool_name: &'static str,
        arguments: ToolArguments,
        request_context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if let Some(mismatch) = catalog_mismatch(&arguments) {
            return mismatch;
        }
        let Some(authenticated) = request_identity::authenticated_context(&request_context)
            .or_else(|| {
                request_identity::local_transport_context(&request_context, &arguments.agent_id)
            })
        else {
            return missing_authenticated_context();
        };
        let (context, value) = self.prepare_call(tool_name, arguments, authenticated);
        match self.runtime.call(tool_name, context, value).await {
            Ok(value) => CallToolResult::structured(value),
            Err(error) => CallToolResult::structured_error(error_value(&error)),
        }
    }

    async fn invoke_subagent_start(
        &self,
        arguments: ToolArguments,
        peer: Peer<RoleServer>,
        request_context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if let Some(mismatch) = catalog_mismatch(&arguments) {
            return mismatch;
        }
        let Some(authenticated) = request_identity::authenticated_context(&request_context)
            .or_else(|| {
                request_identity::local_transport_context(&request_context, &arguments.agent_id)
            })
        else {
            return missing_authenticated_context();
        };
        let (context, mut value) =
            self.prepare_call("agent_subagent_start", arguments, authenticated);
        // Browser model/reasoning choices are dispatch metadata, not part of the durable runtime
        // registration contract. Strip them before registration so upstream child identity and
        // idempotency stay unchanged, then attach them only to fallback dispatch metadata.
        let requested_model = value
            .as_object_mut()
            .and_then(|object| object.remove("model"))
            .and_then(|value| match value {
                Value::String(model) => {
                    let model = model.trim().to_owned();
                    (!model.is_empty()).then_some(model)
                }
                _ => None,
            });
        let requested_reasoning = value
            .as_object_mut()
            .and_then(|object| object.remove("reasoning"))
            .and_then(|value| match value {
                Value::String(reasoning) => {
                    let reasoning = reasoning.trim().to_owned();
                    (!reasoning.is_empty()).then_some(reasoning)
                }
                _ => None,
            });
        let request = value
            .get("request")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let delegated_request = crate::subagent_protocol::delegated_request(&request, &value);
        value["request"] = Value::String(delegated_request.clone());
        let mut registration = match self
            .runtime
            .call("agent_subagent_start", context.clone(), value)
            .await
        {
            Ok(value) => value,
            Err(error) => return CallToolResult::structured_error(error_value(&error)),
        };
        if let Some(object) = registration.as_object_mut() {
            if let Some(model) = requested_model.as_deref() {
                object.insert("model".to_owned(), Value::String(model.to_owned()));
            }
            if let Some(reasoning) = requested_reasoning.as_deref() {
                object.insert("reasoning".to_owned(), Value::String(reasoning.to_owned()));
            }
        }

        let registered = registration.clone();
        let status = registration
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("pending");
        if (requested_model.is_some() || requested_reasoning.is_some()) && status == "pending" {
            // Explicit browser choice metadata must not be silently ignored by native sampling.
            match self
                .runtime
                .request_subagent_fallback(&context, &registration, &delegated_request)
                .await
            {
                Ok(fallback) => {
                    return CallToolResult::structured(
                        crate::subagent_protocol::enrich_registration(
                            registration,
                            serde_json::json!({
                                "dispatchMode": "extensionFallback",
                                "nativeDelegationRequired": false,
                                "status": "pending",
                                "workerStarted": false,
                                "fallbackRequested": true,
                                "fallbackAttempt": fallback.get("attempt").cloned().unwrap_or(Value::Null),
                                "instruction": "ChatCMD queued this child with explicit browser model/reasoning choices. Do not duplicate the delegated work in the parent. Call agent_subagent_wait until the child finishes or the fallback exhausts its retries."
                            }),
                        ),
                    );
                }
                Err(error) => {
                    if let Some(child_task_id) = registered
                        .get("childTaskId")
                        .or_else(|| registered.get("taskId"))
                        .and_then(Value::as_str)
                    {
                        let _ = self
                            .runtime
                            .fail_subagent(child_task_id, &error.message)
                            .await;
                    }
                    let mut failed = registered;
                    if let Some(object) = failed.as_object_mut() {
                        object.insert("status".to_owned(), Value::String("failed".to_owned()));
                        object.insert(
                            "dispatchMode".to_owned(),
                            Value::String("failed".to_owned()),
                        );
                        object.insert("workerStarted".to_owned(), Value::Bool(false));
                        object.insert(
                            "startupError".to_owned(),
                            serde_json::json!({"code": error.code, "message": error.message}),
                        );
                    }
                    return CallToolResult::structured(failed);
                }
            }
        }

        let tools = Self::tool_router().list_all();
        match subagent_worker::dispatch_registered_subagent(
            self.runtime.clone(),
            peer,
            context,
            registration,
            &delegated_request,
            tools,
        )
        .await
        {
            Ok(value) => CallToolResult::structured(value),
            Err(error) => {
                if let Some(child_task_id) = registered
                    .get("childTaskId")
                    .or_else(|| registered.get("taskId"))
                    .and_then(Value::as_str)
                {
                    let _ = self
                        .runtime
                        .fail_subagent(child_task_id, &error.message)
                        .await;
                }
                let mut failed = registered;
                if let Some(object) = failed.as_object_mut() {
                    object.insert("status".to_owned(), Value::String("failed".to_owned()));
                    object.insert(
                        "dispatchMode".to_owned(),
                        Value::String("failed".to_owned()),
                    );
                    object.insert("workerStarted".to_owned(), Value::Bool(false));
                    object.insert(
                        "startupError".to_owned(),
                        serde_json::json!({"code": error.code, "message": error.message}),
                    );
                }
                CallToolResult::structured(failed)
            }
        }
    }
}

fn missing_authenticated_context() -> CallToolResult {
    CallToolResult::structured_error(serde_json::json!({
        "error": {
            "code": "authenticated_context_missing",
            "message": "trusted MCP request identity is unavailable",
            "retryable": true,
            "approvalRequired": false,
            "phase": "authentication",
            "outcome": "notStarted",
            "recovery": "reconnectWithAuthenticatedContext"
        },
        "usage": null
    }))
}

fn catalog_mismatch(arguments: &ToolArguments) -> Option<CallToolResult> {
    let client_hash = arguments.client_catalog_hash.as_deref()?;
    let metadata = catalog_metadata();
    if client_hash == metadata.catalog_hash {
        return None;
    }
    Some(CallToolResult::structured_error(serde_json::json!({
        "error": {
            "code": "catalog_mismatch",
            "message": "MCP tool catalog changed; refresh tool schemas and reconnect before retrying",
            "retryable": true,
            "approvalRequired": false,
            "phase": "contractValidation",
            "outcome": "unchanged",
            "recovery": "refreshAndRetry"
        },
        "serverCatalogHash": metadata.catalog_hash,
        "clientCatalogHash": client_hash,
        "catalogVersion": metadata.catalog_version,
        "protocolVersion": metadata.protocol_version,
        "recovery": "discard cached tool schemas, reconnect, initialize, and list_tools again",
        "reconnect": {
            "required": true,
            "maxAttempts": 1,
            "steps": ["discardCachedSchemas", "reconnect", "initialize", "listTools", "retryCall"]
        }
    })))
}
