# Routing and operational FAQ

[简体中文](../../zh-CN/report/FAQ与账号命中规则.md)

## Source selection

| Policy | Meaning |
| --- | --- |
| Ordered | Try eligible candidates in configured order; failures can advance the chain |
| Balanced | Rotate eligible candidates within key/model scope, subject to explicit health policy |
| Quota priority | Prefer eligible sources according to configured remaining-window policy |
| Manual/source binding | Restrict selection to the authorized configured source and mappings |

Earlier sort does not guarantee a hit. Disabled state, missing credentials, model mismatch, quota windows, cooldown, circuit and in-flight capacity can exclude a source.

Native conversation anchors retain priority over an unrelated body cache key. Switching accounts can require a different upstream thread generation; model routing must not reuse incompatible provider state.

## Common failures

| Issue | Diagnosis |
| --- | --- |
| OAuth callback unavailable | Check callback listener/port and supported manual completion |
| Provider challenge or regional denial | Check authorized account status, configured network exit and provider response |
| Loopback intercepted by a system proxy | Exempt local loopback according to the deployment's network policy |
| Standalone storage not writable | Configure writable persistent paths and key-file permissions |
| Imported models use the wrong source | Inspect mappings; aggregate discovery cannot grant account-pool access |
| Temporary capacity rejection | Inspect Retry-After and active/waiting budgets rather than increasing every layer |

Do not recommend removed compatibility switches or promise future session behavior as current functionality.

## Trace interpretation

Candidate-pool, candidate-start/skip and final-result events explain eligibility and attempts. Distinguish queue wait, connection time, first byte and total duration. No sample means unknown, not zero. See [gateway](../../../backend/service/src/gateway/README.md) and [anchor policy](native-thread-anchor-priority.md).
