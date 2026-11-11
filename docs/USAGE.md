# Usage statistics / 用量统计

- Home shows today's USD estimated cost, request count, reported total Tokens and cache hit rate. Dates follow the service's local calendar.
- API Keys shows lifetime totals from detailed and compacted token statistics, including older records. API-key quota configuration and enforcement are unchanged.
- The single green heatmap scrolls horizontally with a mouse wheel, drag, trackpad or touch. Its scrollbar is hidden. The date range and range totals follow the visible weeks; the lifetime summary stays fixed. More usage means a darker/stronger green, using one scale across the whole timeline.
- Daily history is stored independently in migration `074_usage_daily_history`; normal detail retention or clearing request logs does not reset it. Available detailed history is backfilled. Previously compacted records without dates remain in lifetime totals but cannot be placed on the calendar. Their recorded request count is a confirmed lower bound, shown with `≥` and a tooltip.
- Members receive only their own keys' statistics. Administrators can view all keys. Unknown cache rate (no input Tokens) displays `—`; a failed request to the statistics API displays an error rather than fabricated zeros.

首页只展示今日数据；密钥页展示长期累计，成本统一使用美元。热力图只有一张，可横向滚动，日期和区间汇总随视口变化，滚动条隐藏。按日汇总独立长期保存，既有密钥额度规则保持不变。
