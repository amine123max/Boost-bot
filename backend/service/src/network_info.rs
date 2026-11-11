use serde::{Deserialize, Serialize};
use std::io::Read;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NetworkInfo {
    ip: String,
    country: String,
    country_code: String,
    region: String,
    city: String,
    isp: String,
    organization: String,
    asn: Option<u64>,
    timezone: String,
    via_proxy: bool,
    queried_at: i64,
}
#[derive(Deserialize)]
struct IpResponse {
    success: bool,
    message: Option<String>,
    ip: Option<String>,
    country: Option<String>,
    country_code: Option<String>,
    region: Option<String>,
    city: Option<String>,
    connection: Option<Connection>,
    timezone: Option<Timezone>,
}
#[derive(Deserialize, Default)]
struct Connection {
    asn: Option<u64>,
    isp: Option<String>,
    org: Option<String>,
}
#[derive(Deserialize)]
struct Timezone {
    id: Option<String>,
}

pub(crate) fn read_network_info(refresh: bool) -> Result<NetworkInfo, String> {
    type Cache = Option<(Instant, Option<String>, NetworkInfo)>;
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    let proxy = crate::gateway::current_upstream_proxy_url();
    let mut cache = CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if !refresh {
        if let Some((at, old_proxy, info)) = cache.as_ref() {
            if at.elapsed() < Duration::from_secs(300) && old_proxy == &proxy {
                return Ok(info.clone());
            }
        }
    }
    let mut builder = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .no_proxy();
    if let Some(ref proxy_url) = proxy {
        builder = builder
            .proxy(reqwest::Proxy::all(proxy_url).map_err(|e| format!("代理地址无效: {e}"))?);
    }
    let client = builder
        .build()
        .map_err(|e| format!("创建 IP 查询失败: {e}"))?;
    let response = client
        .get("https://ipwho.is/")
        .send()
        .map_err(|_| "无法查询出口 IP，请检查网络或代理".to_string())?
        .error_for_status()
        .map_err(|e| format!("IP 查询失败: {e}"))?;
    let mut body = String::new();
    response
        .take(65_536)
        .read_to_string(&mut body)
        .map_err(|_| "IP 查询返回无效数据".to_string())?;
    let response: IpResponse =
        serde_json::from_str(&body).map_err(|_| "IP 查询返回无效数据".to_string())?;
    if !response.success {
        return Err(response
            .message
            .unwrap_or_else(|| "IP 查询失败".to_string()));
    }
    let ip = response.ip.ok_or_else(|| "IP 查询缺少地址".to_string())?;
    ip.parse::<std::net::IpAddr>()
        .map_err(|_| "IP 查询地址格式无效".to_string())?;
    let connection = response.connection.unwrap_or_default();
    let info = NetworkInfo {
        ip,
        country: response.country.unwrap_or_default(),
        country_code: response.country_code.unwrap_or_default(),
        region: response.region.unwrap_or_default(),
        city: response.city.unwrap_or_default(),
        isp: connection.isp.unwrap_or_default(),
        organization: connection.org.unwrap_or_default(),
        asn: connection.asn,
        timezone: response.timezone.and_then(|t| t.id).unwrap_or_default(),
        via_proxy: proxy.is_some(),
        queried_at: boost_core::storage::now_ts(),
    };
    *cache = Some((Instant::now(), proxy, info.clone()));
    Ok(info)
}
