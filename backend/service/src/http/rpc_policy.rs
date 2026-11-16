//! Reviewed scheduling classes. Unknown methods deliberately use the global barrier.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Resource {
    Accounts,
    Keys,
    Models,
    Billing,
    Bot,
    Settings,
    Maintenance,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RpcClass {
    Read,
    Write(Resource),
    Exclusive,
}

pub(super) fn classify(method: &str) -> RpcClass {
    use Resource::*;
    match method {
        // Explicitly reviewed local queries; remote discovery and exports are excluded.
        "initialize"
        | "account/list"
        | "account/read"
        | "account/usage/list"
        | "account/usage/read"
        | "account/usage/aggregate"
        | "apikey/list"
        | "apikey/readSecret"
        | "apikey/usageStats"
        | "apikey/modelRouting"
        | "apikey/modelCatalogList"
        | "aggregateApi/list"
        | "aggregateApi/readSecret"
        | "aggregateApi/supplierModels/list"
        | "dashboard/usageHistory"
        | "dashboard/adminUsageSummary"
        | "dashboard/memberSummary"
        | "requestlog/list"
        | "requestlog/summary"
        | "service/telemetry"
        | "service/listenConfig/get"
        | "accountManager/session/current"
        | "accountManager/users/list"
        | "accountManager/apiKeyOwners/list"
        | "modelGroups/list" => RpcClass::Read,

        "account/import"
        | "account/warmup"
        | "account/chatgptAuthTokens/refresh"
        | "account/chatgptAuthTokens/refreshAll"
        | "account/usage/refresh"
        | "account/login/start"
        | "account/login/status"
        | "account/login/complete"
        | "account/export"
        | "account/exportData" => RpcClass::Write(Accounts),

        "apikey/create" | "apikey/disable" | "apikey/enable" | "apikey/updateModel" => {
            RpcClass::Write(Keys)
        }

        "aggregateApi/testConnection"
        | "aggregateApi/refreshBalance"
        | "aggregateApi/supplierModels/save"
        | "aggregateApi/supplierModels/delete"
        | "aggregateApi/sourceModels/importSupplier"
        | "apikey/modelSourceSync"
        | "apikey/modelSourceModelSave"
        | "apikey/modelSourceMappingSave"
        | "apikey/modelSourceMappingDelete"
        | "apikey/modelCatalogSave"
        | "apikey/modelCatalogDelete" => RpcClass::Write(Models),

        "accountManager/wallet/topUp"
        | "accountManager/wallet/setAvailable"
        | "quota/modelPriceRule/upsert"
        | "quota/modelPriceRule/delete"
        | "quota/modelPriceRules/syncOfficial"
        | "quota/modelPriceRules/syncOpenai"
        | "quota/billingRule/upsert"
        | "quota/billingRule/delete" => RpcClass::Write(Billing),

        "bot/open" | "bot/activity" => RpcClass::Write(Bot),

        "gateway/proxy/action" | "service/networkInfo" | "service/codexConfig/read" => {
            RpcClass::Write(Settings)
        }

        // Deletion, ownership, configuration reload and unknown methods can cross domains.
        _ => RpcClass::Exclusive,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classification_is_explicit_and_cross_domain_changes_are_exclusive() {
        assert_eq!(classify("account/list"), RpcClass::Read);
        assert_eq!(
            classify("account/import"),
            RpcClass::Write(Resource::Accounts)
        );
        assert_eq!(classify("apikey/create"), RpcClass::Write(Resource::Keys));
        for method in [
            "account/delete",
            "account/update",
            "apikey/delete",
            "appSettings/set",
            "future/list",
            "unknown/get",
        ] {
            assert_eq!(classify(method), RpcClass::Exclusive, "{method}");
        }
    }
}
