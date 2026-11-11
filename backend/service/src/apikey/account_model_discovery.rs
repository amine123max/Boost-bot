use super::*;

pub(super) fn sync<F>(
    storage: &Storage,
    source_id: Option<&str>,
    mut discover: F,
) -> Result<(), String>
where
    F: FnMut(&str) -> Result<ModelsResponse, String>,
{
    let accounts = storage
        .list_accounts()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|a| a.status == "active" && source_id.map_or(true, |id| id == a.id))
        .collect::<Vec<_>>();
    if accounts.is_empty() {
        return Err("没有可用于拉取模型的启用账号".into());
    }
    let mut errors = Vec::new();
    for account in accounts {
        let models = match discover(&account.id) {
            Ok(models) => normalize_models_response(models),
            Err(error) => {
                errors.push(format!("{}：{error}", account.label));
                continue;
            }
        };
        if models.models.is_empty() {
            errors.push(format!("{}：远端模型为空，已保留原有模型", account.label));
            continue;
        }
        let slugs = models
            .models
            .iter()
            .filter(|model| model.supported_in_api)
            .map(|m| m.slug.clone())
            .collect::<Vec<_>>();
        let mut previous =
            stale_source_upstream_models(storage, ROUTING_SOURCE_KIND_OPENAI_ACCOUNT, &account.id)?;
        let catalog = read_managed_model_catalog_from_storage(storage)?;
        previous.extend(
            catalog
                .items
                .iter()
                .filter(|item| {
                    !item.user_edited
                        && item
                            .model
                            .extra
                            .get("builtin_custom")
                            .and_then(Value::as_bool)
                            == Some(true)
                })
                .map(|item| item.model.slug.clone()),
        );
        let next = merge_managed_model_catalog(catalog, models);
        save_managed_model_catalog_with_storage(storage, &next)?;
        // Retire snapshots inferred by older versions before storing account-specific discovery.
        storage
            .upsert_discovered_model_source_models(
                ROUTING_SOURCE_KIND_OPENAI_ACCOUNT,
                &account.id,
                &slugs,
                "synced",
            )
            .map_err(|e| e.to_string())?;
        storage
            .upsert_discovered_model_source_models(
                ROUTING_SOURCE_KIND_OPENAI_ACCOUNT,
                &account.id,
                &slugs,
                "account_remote",
            )
            .map_err(|e| e.to_string())?;
        auto_associate_source_models(
            storage,
            ROUTING_SOURCE_KIND_OPENAI_ACCOUNT,
            &account.id,
            true,
            true,
        )?;
        let current = slugs.into_iter().collect::<HashSet<_>>();
        cleanup_orphan_auto_catalog_models(
            storage,
            &previous.difference(&current).cloned().collect(),
        )?;
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("；"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn storage() -> Storage {
        let s = Storage::open_in_memory().unwrap();
        s.init().unwrap();
        for id in ["account-a", "account-b"] {
            s.insert_account(&boost_core::storage::Account {
                id: id.into(),
                label: id.into(),
                issuer: "issuer".into(),
                chatgpt_account_id: None,
                workspace_id: None,
                group_name: None,
                sort: 0,
                status: "active".into(),
                created_at: 1,
                updated_at: 1,
            })
            .unwrap();
        }
        s
    }
    fn response(model: &str) -> ModelsResponse {
        ModelsResponse {
            models: vec![ModelInfo {
                slug: model.into(),
                display_name: format!("Name {model}"),
                supported_in_api: true,
                ..Default::default()
            }],
            extra: BTreeMap::new(),
        }
    }
    #[test]
    fn account_snapshots_remain_separate_after_routing_reads() {
        let storage = storage();
        sync(&storage, None, |id| {
            Ok(response(if id == "account-a" {
                "model-a"
            } else {
                "model-b"
            }))
        })
        .unwrap();
        bootstrap_account_pool_model_routes(&storage, false).unwrap();
        for (id, model) in [("account-a", "model-a"), ("account-b", "model-b")] {
            let rows = storage
                .list_model_source_models(Some(ROUTING_SOURCE_KIND_OPENAI_ACCOUNT), Some(id))
                .unwrap();
            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0].upstream_model, model);
            assert_eq!(rows[0].discovery_kind, "account_remote");
        }
        let catalog = read_managed_model_catalog_from_storage(&storage).unwrap();
        assert_eq!(catalog.items.len(), 2);
    }
    #[test]
    fn failed_or_empty_discovery_preserves_prior_models() {
        let storage = storage();
        sync(&storage, Some("account-a"), |_| Ok(response("retained"))).unwrap();
        assert!(sync(&storage, Some("account-a"), |_| Err(
            "upstream unavailable".into()
        ))
        .is_err());
        assert!(sync(&storage, Some("account-a"), |_| Ok(
            ModelsResponse::default()
        ))
        .is_err());
        let rows = storage
            .list_model_source_models(Some(ROUTING_SOURCE_KIND_OPENAI_ACCOUNT), Some("account-a"))
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].upstream_model, "retained");
    }
    #[test]
    fn successful_account_refresh_retires_old_inferred_models() {
        let storage = storage();
        storage
            .upsert_discovered_model_source_models(
                ROUTING_SOURCE_KIND_OPENAI_ACCOUNT,
                "account-a",
                &["old-inferred".into()],
                "synced",
            )
            .unwrap();
        sync(&storage, Some("account-a"), |_| {
            Ok(response("actual-remote"))
        })
        .unwrap();
        bootstrap_account_pool_model_routes(&storage, false).unwrap();
        let rows = storage
            .list_model_source_models(Some(ROUTING_SOURCE_KIND_OPENAI_ACCOUNT), Some("account-a"))
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].upstream_model, "actual-remote");
        assert!(storage
            .list_model_source_models(Some(ROUTING_SOURCE_KIND_OPENAI_ACCOUNT), Some("account-b"))
            .unwrap()
            .is_empty());
    }
}
