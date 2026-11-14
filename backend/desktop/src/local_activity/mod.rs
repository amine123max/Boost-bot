//! Read-only, bounded local-agent activity. Never exports prompts, replies or paths.
mod parser;
mod rate;
use parser::Task;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Cursor, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime},
};

const READ_BUDGET: usize = 2 * 1024 * 1024;
const LINE_LIMIT: usize = 256 * 1024;
struct Log {
    provider: &'static str,
    offset: u64,
    modified: SystemTime,
    task: Task,
}
#[derive(Default)]
struct Observer {
    logs: HashMap<PathBuf, Log>,
    scanned: Option<Instant>,
    sources: Vec<&'static str>,
}
static OBSERVER: OnceLock<Mutex<Observer>> = OnceLock::new();

fn root(variable: &str, fallback: &str, home: &Path) -> PathBuf {
    std::env::var_os(variable)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(fallback))
}
fn discover(
    path: &Path,
    depth: usize,
    provider: &'static str,
    found: &mut Vec<(SystemTime, PathBuf, &'static str)>,
    budget: &mut usize,
) {
    if depth == 0 || *budget == 0 {
        return;
    }
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            discover(&entry.path(), depth - 1, provider, found, budget);
        } else if kind.is_file() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !(name.ends_with(".jsonl")
                || provider == "deepseek" && name == "session.v4.jsonl.zstd")
            {
                continue;
            }
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            if modified.elapsed().unwrap_or_default() < Duration::from_secs(86400) {
                found.push((modified, entry.path(), provider));
            }
        }
    }
}

fn consume_lines(log: &mut Log, bytes: &[u8], fallback: i64) -> usize {
    let mut consumed = 0;
    for line in bytes.split_inclusive(|b| *b == b'\n') {
        if line.last() != Some(&b'\n') {
            break;
        }
        consumed += line.len();
        if line.len() > LINE_LIMIT {
            continue;
        }
        if let Ok(value) = serde_json::from_slice::<Value>(line) {
            log.task.consume(log.provider, &value, fallback);
        }
    }
    consumed
}

impl Observer {
    fn read(&mut self) -> Value {
        if self
            .scanned
            .is_none_or(|at| at.elapsed() >= Duration::from_secs(2))
        {
            let home = std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(PathBuf::from)
                .unwrap_or_default();
            let roots = [
                (
                    "codex",
                    root("CODEX_HOME", ".codex", &home).join("sessions"),
                ),
                (
                    "claude",
                    root("CLAUDE_CONFIG_DIR", ".claude", &home).join("projects"),
                ),
                ("deepseek", root("DSH_HOME", ".dsh", &home).join("sessions")),
            ];
            self.sources = roots
                .iter()
                .filter(|(_, root)| root.is_dir())
                .map(|(name, _)| *name)
                .collect();
            let mut found = Vec::new();
            for (provider, path) in roots {
                let mut provider_files = Vec::new();
                discover(&path, 5, provider, &mut provider_files, &mut 8192);
                provider_files.sort_by_key(|(at, _, _)| std::cmp::Reverse(*at));
                provider_files.truncate(16);
                found.extend(provider_files);
            }
            found.sort_by_key(|(at, _, _)| std::cmp::Reverse(*at));
            found.truncate(48);
            self.logs
                .retain(|path, _| found.iter().any(|(_, p, _)| p == path));
            for (modified, path, provider) in found {
                self.logs.entry(path).or_insert(Log {
                    provider,
                    modified,
                    offset: 0,
                    task: Task::default(),
                });
            }
            self.scanned = Some(Instant::now());
        }
        let mut budget = READ_BUDGET;
        let mut decoded_budget = 4 * READ_BUDGET;
        let mut recent_logs: Vec<_> = self.logs.iter_mut().collect();
        recent_logs.sort_by_key(|(_, log)| std::cmp::Reverse(log.task.at));
        for (path, log) in recent_logs {
            if budget == 0 {
                break;
            }
            let Ok(meta) = fs::metadata(path) else {
                continue;
            };
            let modified = meta.modified().unwrap_or(log.modified);
            if meta.len() < log.offset {
                log.offset = 0;
                log.task = Task::default();
            }
            if meta.len() == log.offset {
                continue;
            }
            let Ok(mut file) = File::open(path) else {
                continue;
            };
            let compressed = path.extension().is_some_and(|s| s == "zstd");
            // Attaching to a large JSONL log needs only its recent tail, not conversation history.
            if !compressed && log.offset == 0 && meta.len() > READ_BUDGET as u64 {
                log.offset = meta.len() - READ_BUDGET as u64;
                if file.seek(SeekFrom::Start(log.offset)).is_err() {
                    continue;
                }
                let mut first = Vec::new();
                if std::io::BufRead::read_until(
                    &mut std::io::BufReader::new(&mut file),
                    b'\n',
                    &mut first,
                )
                .is_ok()
                {
                    log.offset += first.len() as u64;
                }
            }
            if file.seek(SeekFrom::Start(log.offset)).is_err() {
                continue;
            }
            let mut bytes = Vec::new();
            if file.take(budget as u64).read_to_end(&mut bytes).is_err() {
                continue;
            }
            budget = budget.saturating_sub(bytes.len());
            let at = modified
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64;
            if compressed {
                let mut consumed = 0;
                while consumed < bytes.len() && decoded_budget > 0 {
                    let cursor = Cursor::new(&bytes[consumed..]);
                    let Ok(decoder) = zstd::stream::read::Decoder::with_buffer(cursor) else {
                        break;
                    };
                    let mut decoder = decoder.single_frame().take((decoded_budget + 1) as u64);
                    let mut decoded = Vec::new();
                    if decoder.read_to_end(&mut decoded).is_err() || decoded.len() > decoded_budget
                    {
                        break;
                    }
                    let used = decoder.into_inner().finish().position() as usize;
                    if used == 0 {
                        break;
                    }
                    decoded_budget = decoded_budget.saturating_sub(decoded.len());
                    consume_lines(log, &decoded, at);
                    consumed += used;
                }
                log.offset += consumed as u64;
            } else {
                let consumed = consume_lines(log, &bytes, at);
                log.offset += if consumed == 0 && bytes.len() == READ_BUDGET {
                    bytes.len()
                } else {
                    consumed
                } as u64;
            }
            log.modified = modified;
        }
        let now = chrono::Utc::now().timestamp_millis();
        let tasks: Vec<_> = self
            .logs
            .values()
            .filter(|l| {
                !l.task.state.is_empty()
                    && now - l.task.at
                        < if matches!(l.task.state, "working" | "waiting") {
                            600_000
                        } else {
                            60_000
                        }
            })
            .collect();
        let active: Vec<_> = tasks
            .iter()
            .filter(|l| matches!(l.task.state, "working" | "waiting"))
            .collect();
        let waiting = active.iter().filter(|l| l.task.state == "waiting").count();
        let selected = active
            .iter()
            .find(|l| l.task.state == "waiting")
            .copied()
            .or_else(|| active.iter().max_by_key(|l| l.task.at).copied())
            .or_else(|| tasks.iter().max_by_key(|l| l.task.at));
        let percent = if active.len() > 1 {
            active.iter().map(|log| log.task.percent).collect::<Option<Vec<_>>>().map(|values| values.iter().sum::<u64>() / values.len() as u64)
        } else {
            selected.and_then(|l| l.task.percent)
        };
        let mut active_sources = Vec::<&str>::new();
        for log in &active {
            if !active_sources.contains(&log.provider) {
                active_sources.push(log.provider);
            }
        }
        if active_sources.is_empty() {
            if let Some(log) = selected {
                active_sources.push(log.provider);
            }
        }
        let rate_tasks: Vec<_> = if active.is_empty() {
            tasks.iter().filter(|l| l.task.state == "done").collect()
        } else {
            active.iter().copied().collect()
        };
        let rates: Vec<_> = rate_tasks
            .iter()
            .filter(|log| log.task.state != "waiting")
            .filter_map(|log| log.task.rate.retained(now))
            .collect();
        let tokens_per_second = if rates.is_empty() {
            None
        } else {
            Some(rates.iter().sum::<f64>())
        };
        let rate_at = rate_tasks.iter().filter_map(|log| log.task.rate.sampled_at()).max();
        let rate_stale = rate_tasks.iter().any(|log| log.task.rate.retained(now).is_some() && log.task.rate.value(now).is_none());
        let rate_kind = if rate_tasks.iter().filter(|log| log.task.rate.retained(now).is_some()).all(|log| log.task.rate.kind == "counter") { "counter" } else { "request" };
        json!({"available":true,"state":selected.map(|l| l.task.state).unwrap_or("idle"),"percent":percent,
            "tokensPerSecond":tokens_per_second,"updatedAt":now,
            "rateUpdatedAt":rate_at,"rateKind":rate_kind,"rateStale":rate_stale,
            "activeTasks":active.len(),"waitingTasks":waiting,"sources":self.sources,
            "activeSources":active_sources,
            "stale":selected.is_some_and(|l| l.task.state == "working" && l.task.reported_at > 0 && now - l.task.reported_at > 120_000)})
    }
}

pub(crate) fn read() -> Result<Value, String> {
    OBSERVER
        .get_or_init(|| Mutex::new(Observer::default()))
        .lock()
        .map_err(|_| "任务状态暂不可用".to_string())
        .map(|mut observer| observer.read())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn fixture(provider: &'static str, extension: &str, bytes: &[u8]) -> (Observer, PathBuf) {
        let path = std::env::temp_dir().join(format!(
            "boost-activity-{}-{}.{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            extension
        ));
        fs::write(&path, bytes).unwrap();
        let mut observer = Observer {
            scanned: Some(Instant::now()),
            sources: vec![provider],
            ..Observer::default()
        };
        observer.logs.insert(
            path.clone(),
            Log {
                provider,
                offset: 0,
                modified: SystemTime::now(),
                task: Task::default(),
            },
        );
        (observer, path)
    }
    #[test]
    fn partial_lines_are_retried_and_turn_end_only_completes_after_append() {
        let start =
            b"{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\",\"turn_id\":\"a\"}}\n";
        let (mut observer, path) = fixture("codex", "jsonl", start);
        assert_eq!(observer.read()["state"], "working");
        let mut file = fs::OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(b"{\"type\":\"event_msg\",\"payload\":")
            .unwrap();
        assert_eq!(observer.read()["state"], "working");
        file.write_all(b"{\"type\":\"task_complete\"}}\n").unwrap();
        drop(file);
        assert_eq!(observer.read()["percent"], 100);
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn harness_concatenated_frames_and_incomplete_append_remain_incremental() {
        let start = zstd::stream::encode_all(
            Cursor::new(b"{\"type\":\"turn/start\",\"data\":{\"turn\":1}}\n"),
            1,
        )
        .unwrap();
        let end = zstd::stream::encode_all(Cursor::new(b"{\"type\":\"turn/end\",\"data\":{\"turn\":1,\"reason\":{\"kind\":\"completed\"}}}\n"), 1).unwrap();
        let (mut observer, path) = fixture("deepseek", "zstd", &start);
        assert_eq!(observer.read()["state"], "working");
        let mut file = fs::OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(&end[..end.len() / 2]).unwrap();
        assert_eq!(observer.read()["state"], "working");
        file.write_all(&end[end.len() / 2..]).unwrap();
        drop(file);
        assert_eq!(observer.read()["state"], "done");
        assert_eq!(
            observer.logs[&path].offset,
            (start.len() + end.len()) as u64
        );
        fs::remove_file(path).unwrap();
    }
}
