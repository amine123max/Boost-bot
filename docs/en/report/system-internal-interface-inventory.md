# Internal interfaces and transport contracts

[简体中文](../../zh-CN/report/系统内部接口总表.md) · [Architecture](../../../ARCHITECTURE.md)

Method names are generated from service dispatch. Parameters and responses are defined by typed frontend wrappers and Rust types. This is an internal integration reference, not a public authorization bypass.

## Transport and identity

| Entry | Contract |
| --- | --- |
| Tauri IPC | Central invoke/invokeFirst; service address through withAddr; native registry defines availability |
| Web POST /api/rpc | Boost Web validates the session and derives the actor before forwarding |
| Service POST /rpc | Internal credential and trusted actor; never disclose that credential to ordinary clients |
| Model /v1/ | Platform key, model access, quota and accounting, independently of management RPC |

Requests use JSON-RPC method names. Frontend underscore commands and camelCase/slash RPC names must remain synchronized across implementation, native registration, Web mapping and typed wrappers.

## Dispatched methods

| Method | Domain | Implementation |
| --- | --- | --- |
| `account/chatgptAuthTokens/refresh` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/chatgptAuthTokens/refreshAll` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/delete` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/deleteByStatuses` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/deleteMany` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/deleteUnavailableFree` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/export` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/exportData` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/import` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/list` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/login/complete` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/login/start` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/login/status` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/logout` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/read` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/update` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `account/usage/aggregate` | Accounts, authorization and usage | [usage.rs](../../../backend/service/src/rpc_dispatch/usage.rs) |
| `account/usage/list` | Accounts, authorization and usage | [usage.rs](../../../backend/service/src/rpc_dispatch/usage.rs) |
| `account/usage/read` | Accounts, authorization and usage | [usage.rs](../../../backend/service/src/rpc_dispatch/usage.rs) |
| `account/usage/refresh` | Accounts, authorization and usage | [usage.rs](../../../backend/service/src/rpc_dispatch/usage.rs) |
| `account/usage/resetCredits` | Accounts, authorization and usage | [usage.rs](../../../backend/service/src/rpc_dispatch/usage.rs) |
| `account/usage/resetQuota` | Accounts, authorization and usage | [usage.rs](../../../backend/service/src/rpc_dispatch/usage.rs) |
| `account/warmup` | Accounts, authorization and usage | [account.rs](../../../backend/service/src/rpc_dispatch/account.rs) |
| `accountManager/apiKeyOwners/list` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/apiKeyOwners/set` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/distribution/set` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/password/change` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/profile/update` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/session/current` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/status` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/users/create` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/users/delete` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/users/list` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/users/update` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/wallet/setAvailable` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/wallet/topUp` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `accountManager/webAuthMode/set` | Users, sessions, ownership and wallets | [account_manager.rs](../../../backend/service/src/rpc_dispatch/account_manager.rs) |
| `aggregateApi/create` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/delete` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/list` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/readSecret` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/refreshBalance` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/sourceModels/importSupplier` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/supplierModels/delete` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/supplierModels/list` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/supplierModels/save` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/testConnection` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `aggregateApi/update` | Aggregate upstreams and supplier models | [aggregate_api.rs](../../../backend/service/src/rpc_dispatch/aggregate_api.rs) |
| `apikey/create` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/delete` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/disable` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/enable` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/list` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/modelCatalogDelete` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/modelCatalogList` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/modelCatalogSave` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/modelRouting` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/models` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/modelSourceMappingDelete` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/modelSourceMappingSave` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/modelSourceModelSave` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/modelSourceSync` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/readSecret` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/updateModel` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `apikey/usageStats` | Platform keys, model catalog and source mappings | [apikey.rs](../../../backend/service/src/rpc_dispatch/apikey.rs) |
| `appSettings/get` | Application configuration | [app_settings.rs](../../../backend/service/src/rpc_dispatch/app_settings.rs) |
| `appSettings/set` | Application configuration | [app_settings.rs](../../../backend/service/src/rpc_dispatch/app_settings.rs) |
| `dashboard/adminUsageSummary` | Usage and management summaries | [dashboard.rs](../../../backend/service/src/rpc_dispatch/dashboard.rs) |
| `dashboard/memberSummary` | Usage and management summaries | [dashboard.rs](../../../backend/service/src/rpc_dispatch/dashboard.rs) |
| `dashboard/usageHistory` | Usage and management summaries | [dashboard.rs](../../../backend/service/src/rpc_dispatch/dashboard.rs) |
| `gateway/backgroundTasks/get` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/backgroundTasks/set` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/codexLatestVersion/get` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/concurrencyRecommendation/get` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/manualAccount/clear` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/manualAccount/get` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/manualAccount/set` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/proxy/action` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/routeStrategy/get` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/routeStrategy/set` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/transport/get` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/transport/set` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/upstreamProxy/get` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `gateway/upstreamProxy/set` | Routing, proxies, transport and background workers | [gateway.rs](../../../backend/service/src/rpc_dispatch/gateway.rs) |
| `initialize` | Service identity and version | [mod.rs](../../../backend/service/src/rpc_dispatch/mod.rs) |
| `modelGroups/delete` | Member model access and pricing groups | [model_groups.rs](../../../backend/service/src/rpc_dispatch/model_groups.rs) |
| `modelGroups/list` | Member model access and pricing groups | [model_groups.rs](../../../backend/service/src/rpc_dispatch/model_groups.rs) |
| `modelGroups/save` | Member model access and pricing groups | [model_groups.rs](../../../backend/service/src/rpc_dispatch/model_groups.rs) |
| `modelGroups/setModels` | Member model access and pricing groups | [model_groups.rs](../../../backend/service/src/rpc_dispatch/model_groups.rs) |
| `modelGroups/setUsers` | Member model access and pricing groups | [model_groups.rs](../../../backend/service/src/rpc_dispatch/model_groups.rs) |
| `plugin/catalog/refresh` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/disable` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/enable` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/install` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/list` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/logs/list` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/tasks/list` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/tasks/run` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/tasks/update` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/uninstall` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `plugin/update` | Plugin installation, logs and tasks | [mod.rs](../../../backend/service/src/plugin/mod.rs) |
| `quota/accountCapacityOverride/update` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/apiKeyUsage` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/billingRule/delete` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/billingRule/upsert` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/billingRules` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/capacityConfig` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/capacityTemplate/update` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/modelPools` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/modelPriceRule/delete` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/modelPriceRule/upsert` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/modelPriceRules` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/modelPriceRules/syncOfficial` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/modelPriceRules/syncOpenai` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/modelUsage` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/overview` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/refreshSources` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/sourceList` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/sourceModels/set` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `quota/systemPool` | Quota pools, source capacity, prices and billing rules | [quota.rs](../../../backend/service/src/rpc_dispatch/quota.rs) |
| `requestlog/clear` | Authorized request history and summaries | [requestlog.rs](../../../backend/service/src/rpc_dispatch/requestlog.rs) |
| `requestlog/list` | Authorized request history and summaries | [requestlog.rs](../../../backend/service/src/rpc_dispatch/requestlog.rs) |
| `requestlog/summary` | Authorized request history and summaries | [requestlog.rs](../../../backend/service/src/rpc_dispatch/requestlog.rs) |
| `service/codexConfig/read` | Listener configuration, diagnostics and host telemetry | [service_config.rs](../../../backend/service/src/rpc_dispatch/service_config.rs) |
| `service/listenConfig/get` | Listener configuration, diagnostics and host telemetry | [service_config.rs](../../../backend/service/src/rpc_dispatch/service_config.rs) |
| `service/listenConfig/set` | Listener configuration, diagnostics and host telemetry | [service_config.rs](../../../backend/service/src/rpc_dispatch/service_config.rs) |
| `service/networkInfo` | Listener configuration, diagnostics and host telemetry | [service_config.rs](../../../backend/service/src/rpc_dispatch/service_config.rs) |
| `service/telemetry` | Listener configuration, diagnostics and host telemetry | [service_config.rs](../../../backend/service/src/rpc_dispatch/service_config.rs) |
| `startup/snapshot` | Actor-aware startup snapshot | [startup.rs](../../../backend/service/src/rpc_dispatch/startup.rs) |
| `webAuth/password/clear` | Shared-access authentication configuration | [app_settings.rs](../../../backend/service/src/rpc_dispatch/app_settings.rs) |
| `webAuth/password/set` | Shared-access authentication configuration | [app_settings.rs](../../../backend/service/src/rpc_dispatch/app_settings.rs) |
| `webAuth/status` | Shared-access authentication configuration | [app_settings.rs](../../../backend/service/src/rpc_dispatch/app_settings.rs) |

## Scheduling and error semantics

An explicit rpc_policy classifies scheduling; names do not prove read-only behavior. Writes share 6 execution slots and at most 256 waiters, with at most 32 waiters per resource. Reads have 16 in-flight slots and no hidden queue. Cross-resource and unknown methods use a global barrier. Queue timeout means not executed; disconnection after execution begins does not imply rollback. Proxies must not replay writes.

## Maintenance sources

- [Typed clients](../../../frontend/src/lib/api/)
- [Web mapping](../../../frontend/src/lib/api/transport-web-commands.ts)
- [Native registry](../../../backend/desktop/src/commands/registry.rs)
- [RPC policy](../../../backend/service/src/http/rpc_policy.rs)

Run node scripts/generate-interface-docs.mjs to update both languages, then run the repository documentation check.
