use super::{scope, Endpoint, HOSTS};
use crate::RpcActor;
use serde_json::{json, Value};
use std::io::Read;
use std::sync::OnceLock;
use std::time::Duration;

static ACTIVITY_CLIENT: OnceLock<Result<reqwest::blocking::Client, String>> = OnceLock::new();

/// Observe only an already running actor-owned host; polling never launches a bot or creates keys.
pub(crate) fn read(actor: &RpcActor) -> Result<Value, String> {
    let actor_scope = scope(actor)?;
    let endpoint = if let Some(hosts) = HOSTS.get() {
        let mut hosts = hosts
            .lock()
            .map_err(|_| "Boost Bot host lock unavailable")?;
        match hosts.get_mut(&actor_scope) {
            Some(host) => {
                if host
                    .child
                    .try_wait()
                    .map_err(|_| "Boost Bot process unavailable")?
                    .is_none()
                {
                    Some(Endpoint {
                        port: host.port,
                        token: host.token.clone(),
                    })
                } else {
                    None
                }
            }
            _ => None,
        }
    } else {
        None
    };
    let Some(endpoint) = endpoint else {
        return Ok(
            json!({"available":true,"state":"idle","percent":null,"activeTasks":0,"waitingTasks":0}),
        );
    };
    let client = ACTIVITY_CLIENT
        .get_or_init(|| {
            reqwest::blocking::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(2))
                .build()
                .map_err(|_| "Boost Bot activity unavailable".to_string())
        })
        .as_ref()
        .map_err(Clone::clone)?;
    let response = client
        .get(format!(
            "http://127.0.0.1:{}/boost-bot/amb/api/activity",
            endpoint.port
        ))
        .header("x-amb-token", endpoint.token)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|_| "Boost Bot activity unavailable")?;
    let mut body = Vec::new();
    response
        .take(16_385)
        .read_to_end(&mut body)
        .map_err(|_| "Boost Bot activity unavailable")?;
    if body.len() > 16_384 {
        return Err("Boost Bot activity response too large".into());
    }
    serde_json::from_slice(&body).map_err(|_| "Boost Bot activity response invalid".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observing_idle_bot_does_not_launch_host_and_requires_actor_identity() {
        assert!(read(&RpcActor::from_parts(Some("member"), None)).is_err());
        let actor = RpcActor::from_parts(Some("member"), Some("activity-read-only-test"));
        let value = read(&actor).unwrap();
        assert_eq!(value["state"], "idle");
        assert_eq!(value["activeTasks"], 0);
        assert!(value["percent"].is_null());
        if let Some(hosts) = HOSTS.get() {
            assert!(!hosts.lock().unwrap().contains_key(&scope(&actor).unwrap()));
        }
    }
}
