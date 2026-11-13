use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Default)]
pub(super) struct Task {
    pub state: &'static str,
    pub percent: Option<u64>,
    pub at: i64,
    pub reported_at: i64,
    turn: String,
    pending: HashMap<String, (u64, bool)>,
    pub rate: super::rate::OutputRate,
    model_started: i64,
}

fn text(value: &Value) -> String {
    if let Some(raw) = value.as_str() {
        if raw.len() <= 4096 {
            if let Ok(parsed) = serde_json::from_str::<Value>(raw) {
                if parsed["isError"] == true || parsed["is_error"] == true {
                    return String::new();
                }
                if parsed["content"].is_array() {
                    return text(&parsed["content"]);
                }
            }
        }
        return raw.to_string();
    }
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item["text"].as_str())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

impl Task {
    fn start(&mut self, turn: &str, at: i64) {
        if self.turn != turn || !matches!(self.state, "working" | "waiting") {
            self.percent = None;
            self.reported_at = 0;
            self.pending.clear();
            self.rate.reset();
        }
        self.turn = turn.into();
        self.state = "working";
        self.at = at;
        self.model_started = at;
    }
    fn call(&mut self, id: &str, name: &str, args: &Value, at: i64) {
        self.at = at;
        if matches!(
            name,
            "AskUserQuestion"
                | "request_user_input"
                | "ask_user_question"
                | "ask_user"
                | "question"
        ) {
            self.state = "waiting";
        } else {
            self.state = "working";
        }
        let parsed;
        let args = if let Some(raw) = args.as_str() {
            if raw.len() > 32768 {
                return;
            }
            parsed = serde_json::from_str::<Value>(raw).unwrap_or(Value::Null);
            &parsed
        } else {
            args
        };
        let name = name.strip_prefix("functions.").unwrap_or(name);
        if matches!(name, "update_plan" | "TodoWrite" | "todo_write") {
            let steps = args["plan"].as_array().or_else(|| args["todos"].as_array());
            if let Some(steps) = steps.filter(|steps| !steps.is_empty() && steps.len() <= 256) {
                let done = steps
                    .iter()
                    .filter(|step| step["status"] == "completed")
                    .count();
                if self.pending.len() < 32 {
                    self.pending.insert(
                        id.into(),
                        ((done as u64 * 100 / steps.len() as u64).min(99), false),
                    );
                }
            }
        } else if name == "mcp__pacer_progress__report_progress"
            && args.as_object().is_some_and(|a| a.len() == 1)
        {
            if let Some(percent) = args["percent"].as_u64().filter(|p| *p <= 100) {
                if self.pending.len() < 32 {
                    self.pending.insert(id.into(), (percent.min(99), true));
                }
            }
        }
    }
    fn result(&mut self, id: &str, output: &Value, failed: bool, at: i64) {
        self.at = at;
        self.state = "working";
        self.model_started = at;
        if let Some((percent, exact_ack)) = self.pending.remove(id) {
            let result = text(output);
            let ok = if exact_ack {
                result.trim() == "pacer-progress:accepted"
            } else {
                !result.is_empty() && !result.to_lowercase().contains("error")
            };
            if !failed && ok {
                self.percent = Some(percent);
                self.reported_at = at;
            }
        }
    }
    pub fn consume(&mut self, provider: &str, record: &Value, fallback: i64) {
        let at = record["timestamp"]
            .as_str()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.timestamp_millis())
            .or_else(|| record["time"].as_i64())
            .unwrap_or(fallback);
        if at < self.at {
            return;
        }
        let kind = record["type"].as_str().unwrap_or("");
        if provider == "codex" {
            let p = &record["payload"];
            if kind == "event_msg" {
                match p["type"].as_str().unwrap_or("") {
                    "task_started" | "turn_started" => {
                        self.start(p["turn_id"].as_str().unwrap_or(""), at)
                    }
                    "task_complete" | "turn_completed" => {
                        self.state = "done";
                        self.percent = Some(100);
                        self.at = at;
                    }
                    "turn_aborted" => {
                        self.state = "stopped";
                        self.at = at;
                    }
                    "error" | "task_failed" => {
                        self.state = "failed";
                        self.at = at;
                    }
                    "approval_requested" | "request_user_input" => {
                        self.state = "waiting";
                        self.at = at;
                    }
                    "token_count" => {
                        self.at = at;
                        if let Some(tokens) =
                            p["info"]["last_token_usage"]["output_tokens"].as_u64()
                        {
                            self.rate.response(tokens, self.model_started, at);
                        }
                        if let Some(tokens) =
                            p["info"]["total_token_usage"]["output_tokens"].as_u64()
                        {
                            self.rate.cumulative(tokens, at);
                        }
                    }
                    _ => {}
                }
            } else if kind == "response_item" {
                match p["type"].as_str().unwrap_or("") {
                    "function_call" => self.call(
                        p["call_id"].as_str().unwrap_or(""),
                        p["name"].as_str().unwrap_or(""),
                        &p["arguments"],
                        at,
                    ),
                    "function_call_output" => {
                        self.result(p["call_id"].as_str().unwrap_or(""), &p["output"], false, at)
                    }
                    _ => {}
                }
            }
        } else if provider == "claude" {
            let message = &record["message"];
            let blocks = message["content"].as_array();
            if kind == "user"
                && !blocks.is_some_and(|items| items.iter().any(|v| v["type"] == "tool_result"))
            {
                self.start(record["uuid"].as_str().unwrap_or(""), at);
            }
            if let Some(blocks) = blocks {
                for block in blocks {
                    match block["type"].as_str().unwrap_or("") {
                        "tool_use" if kind == "assistant" => self.call(
                            block["id"].as_str().unwrap_or(""),
                            block["name"].as_str().unwrap_or(""),
                            &block["input"],
                            at,
                        ),
                        "tool_result" if kind == "user" => self.result(
                            block["tool_use_id"].as_str().unwrap_or(""),
                            &block["content"],
                            block["is_error"] == true,
                            at,
                        ),
                        _ => {}
                    }
                }
            }
            if kind == "assistant" {
                self.at = at;
                if let Some(tokens) = message["usage"]["output_tokens"].as_u64() {
                    self.rate.response(tokens, self.model_started, at);
                }
                match message["stop_reason"].as_str().unwrap_or("") {
                    "end_turn" | "stop_sequence" => {
                        self.state = "done";
                        self.percent = Some(100);
                        self.at = at;
                    }
                    "refusal" => {
                        self.state = "failed";
                        self.at = at;
                    }
                    _ => {}
                }
            }
            if kind == "system" && record["subtype"] == "turn_duration" {
                self.state = "done";
                self.percent = Some(100);
                self.at = at;
            }
        } else if provider == "deepseek" {
            let p = &record["data"];
            match kind {
                "turn/start" => self.start(&p["turn"].to_string(), at),
                "step/start" => {
                    self.model_started = at;
                }
                "assistant/message" => {
                    self.at = at;
                    if let Some(tokens) = p["usage"]["outputTokens"].as_u64() {
                        self.rate.response(tokens, self.model_started, at);
                    }
                }
                "tool/call" => self.call(
                    p["callId"].as_str().unwrap_or(""),
                    p["name"].as_str().unwrap_or(""),
                    &p["arguments"],
                    at,
                ),
                "tool/result" => self.result(
                    p["message"]["toolCallId"].as_str().unwrap_or(""),
                    &p["message"]["content"],
                    p["message"]["isError"] == true,
                    at,
                ),
                "approval/asked" => {
                    self.state = "waiting";
                    self.at = at;
                }
                "approval/decided" => {
                    self.state = "working";
                    self.at = at;
                }
                "turn/end" => {
                    self.state = match p["reason"]["kind"]
                        .as_str()
                        .or_else(|| p["reason"].as_str())
                        .or_else(|| p["outcome"].as_str())
                        .unwrap_or("")
                    {
                        "completed" | "done" | "stop" => "done",
                        "failed" | "error" | "failure" => "failed",
                        _ => "stopped",
                    };
                    if self.state == "done" {
                        self.percent = Some(100);
                    }
                    self.at = at;
                }
                _ => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn successful_plan_updates_drive_progress_without_completing_the_turn() {
        let mut task = Task::default();
        task.consume(
            "codex",
            &json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"plan"}}),
            1000,
        );
        task.consume("codex", &json!({"type":"response_item","payload":{"type":"function_call","name":"functions.update_plan","call_id":"plan-1","arguments":"{\"plan\":[{\"step\":\"a\",\"status\":\"completed\"},{\"step\":\"b\",\"status\":\"in_progress\"}]}"}}), 2000);
        assert_eq!(task.percent, None);
        task.consume("codex", &json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"plan-1","output":"Plan updated"}}), 2100);
        assert_eq!(task.percent, Some(50));
        assert_eq!(task.state, "working");
        task.consume("codex", &json!({"type":"response_item","payload":{"type":"function_call","name":"update_plan","call_id":"plan-2","arguments":"{\"plan\":[{\"status\":\"completed\"}]}"}}), 2200);
        task.consume("codex", &json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"plan-2","output":"error: rejected"}}), 2300);
        assert_eq!(task.percent, Some(50));
    }
    #[test]
    fn codex_requires_successful_report_and_resets_per_turn() {
        let mut t = Task::default();
        t.consume(
            "codex",
            &json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"a"}}),
            1,
        );
        t.consume("codex", &json!({"type":"response_item","payload":{"type":"function_call","name":"mcp__pacer_progress__report_progress","call_id":"c","arguments":"{\"percent\":65}"}}), 2);
        assert_eq!(t.percent, None);
        t.consume("codex", &json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"c","output":"pacer-progress:accepted"}}), 3);
        assert_eq!(t.percent, Some(65));
        t.consume(
            "codex",
            &json!({"type":"event_msg","payload":{"type":"task_complete"}}),
            4,
        );
        assert_eq!(t.percent, Some(100));
        t.consume(
            "codex",
            &json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"b"}}),
            5,
        );
        assert_eq!(t.percent, None);
    }
    #[test]
    fn claude_tool_wait_is_not_completion_and_prompt_text_is_not_progress() {
        let mut t = Task::default();
        t.consume(
            "claude",
            &json!({"type":"user","uuid":"a","message":{"content":"⟦90%⟧"}}),
            1,
        );
        assert_eq!(t.percent, None);
        t.consume("claude", &json!({"type":"assistant","message":{"stop_reason":"tool_use","content":[{"type":"tool_use","name":"AskUserQuestion","id":"q"}]}}), 2);
        assert_eq!(t.state, "waiting");
        t.consume(
            "claude",
            &json!({"type":"assistant","message":{"stop_reason":"end_turn"}}),
            3,
        );
        assert_eq!(t.state, "done");
    }
    #[test]
    fn deepseek_failure_preserves_estimate_without_completing() {
        let mut t = Task::default();
        t.consume(
            "deepseek",
            &json!({"type":"turn/start","data":{"turn":1}}),
            1,
        );
        t.consume("deepseek", &json!({"type":"approval/asked","data":{}}), 2);
        assert_eq!(t.state, "waiting");
        t.consume(
            "deepseek",
            &json!({"type":"turn/end","data":{"reason":"error"}}),
            3,
        );
        assert_eq!(t.state, "failed");
        assert_eq!(t.percent, None);
    }
}
