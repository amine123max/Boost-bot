use super::*;

pub(super) fn clean(
    storage: &Storage,
    rows: &mut Vec<ModelCatalogModelRecord>,
) -> Result<(), String> {
    let candidates = rows
        .iter()
        .filter(|row| {
            !row.user_edited
                && match row.slug.as_str() {
                    "gpt-image-2" => {
                        row.description.as_deref()
                            == Some("Image generation tool model for Codex image workflows.")
                    }
                    "deepseek-v4-pro" | "deepseek-v4-flash" => {
                        row.description.as_deref()
                            == Some("Built-in custom model for DeepSeek aggregate API routes.")
                            && serde_json::from_str::<Value>(&row.extra_json)
                                .ok()
                                .and_then(|v| v.get("builtin_custom").and_then(Value::as_bool))
                                == Some(true)
                    }
                    _ => false,
                }
        })
        .map(|row| row.slug.clone())
        .collect::<Vec<_>>();
    if candidates.is_empty() {
        return Ok(());
    }
    let sources = storage
        .list_model_source_models(None, None)
        .map_err(|e| e.to_string())?;
    for slug in candidates {
        // Preserve manual imports, real provider discoveries and user-edited catalog entries.
        if sources.iter().any(|source| {
            source.upstream_model == slug
                && !(source.source_kind == ROUTING_SOURCE_KIND_OPENAI_ACCOUNT
                    && source.discovery_kind == "synced")
        }) {
            continue;
        }
        storage
            .delete_legacy_inferred_account_model(&slug)
            .map_err(|e| e.to_string())?;
        delete_model_catalog_entry(storage, &slug)?;
        rows.retain(|row| row.slug != slug);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generated_placeholders_are_removed_but_user_edits_and_actual_imports_survive() {
        let storage = Storage::open_in_memory().unwrap();
        storage.init().unwrap();
        let mut catalog = ManagedModelCatalogResult::default();
        for (slug, edited) in [
            ("deepseek-v4-pro", false),
            ("deepseek-v4-flash", true),
            ("gpt-image-2", false),
        ] {
            let mut model = ModelInfo {
                slug: slug.into(),
                display_name: slug.into(),
                supported_in_api: true,
                description: Some(
                    if slug == "gpt-image-2" {
                        "Image generation tool model for Codex image workflows."
                    } else {
                        "Built-in custom model for DeepSeek aggregate API routes."
                    }
                    .into(),
                ),
                ..Default::default()
            };
            if slug.starts_with("deepseek") {
                model
                    .extra
                    .insert("builtin_custom".into(), serde_json::json!(true));
            }
            catalog.items.push(ManagedModelCatalogEntry {
                model,
                source_kind: MODEL_SOURCE_KIND_CUSTOM.into(),
                user_edited: edited,
                sort_index: catalog.items.len() as i64,
                updated_at: 1,
            });
        }
        save_managed_model_catalog_with_storage(&storage, &catalog).unwrap();
        storage
            .upsert_discovered_model_source_models(
                ROUTING_SOURCE_KIND_OPENAI_ACCOUNT,
                "legacy",
                &["deepseek-v4-pro".into()],
                "synced",
            )
            .unwrap();
        storage
            .upsert_discovered_model_source_models(
                ROUTING_SOURCE_KIND_AGGREGATE_API,
                "actual-api",
                &["gpt-image-2".into()],
                "synced",
            )
            .unwrap();
        let result = read_managed_model_catalog_from_storage(&storage).unwrap();
        assert_eq!(result.items.len(), 2);
        assert!(result
            .items
            .iter()
            .any(|m| m.model.slug == "deepseek-v4-flash"));
        assert!(result.items.iter().any(|m| m.model.slug == "gpt-image-2"));
        assert!(storage
            .list_model_source_models(Some(ROUTING_SOURCE_KIND_OPENAI_ACCOUNT), Some("legacy"))
            .unwrap()
            .is_empty());
        assert_eq!(
            storage
                .list_model_source_models(
                    Some(ROUTING_SOURCE_KIND_AGGREGATE_API),
                    Some("actual-api")
                )
                .unwrap()
                .len(),
            1
        );
    }
}
