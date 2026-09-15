//! Exercise the real nested API router, including extension authorization.
use std::sync::Arc;

use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    response::Response,
};
use serde_json::{Value, json};
use tempfile::TempDir;
use tower::ServiceExt;

use crate::{runtime_host::user_message_tests::test_host, websocket::AppState};

pub(super) async fn fixture(status: &str) -> (Arc<AppState>, Router, TempDir) {
    let (host, agent_id, directory) = test_host().await;
    let state =
        Arc::new(host.test_app_state(directory.path().join("chatcmd.db").display().to_string()));
    let now = super::now_ms();
    // Identical prompt text must not cause two request identities to be conflated.
    for suffix in ["a", "b"] {
        sqlx::query("INSERT INTO tasks(id,agent_id,device_id,title,source,status,generation,created_at_ms,updated_at_ms) VALUES(?,?,?,'Bridge router test','chatgpt_web',?,1,?,?)")
            .bind(format!("task-{suffix}")).bind(&agent_id).bind(state.device.id.as_str())
            .bind(status).bind(now).bind(now).execute(state.repository.pool()).await.expect("seed task");
        sqlx::query("INSERT INTO chatgpt_bridge_requests(id,task_id,turn_id,agent_id,model,user_content,submitted_content,status,created_at_ms,updated_at_ms) VALUES(?,?,?,?,'Auto','hello','hello',?,?,?)")
            .bind(format!("request-{suffix}")).bind(format!("task-{suffix}"))
            .bind(format!("turn-{suffix}")).bind(&agent_id).bind(status).bind(now).bind(now)
            .execute(state.repository.pool()).await.expect("seed request without identity");
    }
    // Match main.rs -> api::router -> /local nesting, not a direct handler call.
    let app = Router::new()
        .nest("/api", super::router(state.clone()))
        .with_state(state.clone());
    (state, app, directory)
}

pub(super) async fn extension_request(
    app: &Router,
    method: &str,
    path: &str,
    body: Value,
) -> Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(path)
                .header("X-ChatCmdClient", "chatgpt-extension")
                .header("Content-Type", "application/json")
                .body(if method == "GET" {
                    Body::empty()
                } else {
                    Body::from(body.to_string())
                })
                .expect("request"),
        )
        .await
        .expect("router response")
}
