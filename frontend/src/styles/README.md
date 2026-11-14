# Shared dialog and surface styling

Boost and the hosted Bot both import [surfaces.css](surfaces.css). Keep dialog
density changes here so normal dialogs, wide Bot editors and confirmations use
the same header geometry.

| Token                            | Default                     | Purpose                              |
| -------------------------------- | --------------------------- | ------------------------------------ |
| `--boost-dialog-heading-height`  | `42px`                      | Minimum dialog header height         |
| `--boost-dialog-heading-block`   | `6px`                       | Header padding above and below       |
| `--boost-dialog-inset`           | `16px`                      | Header, content and footer alignment |
| `--boost-dialog-close-size`      | `28px`                      | Close control area                   |
| `--boost-section-heading-height` | `42px`                      | Independent settings banner          |
| `--boost-shell-heading-height`   | `60px`                      | Boost brand and page title row       |
| `--boost-shell-heading-surface`  | Theme specific neutral gray | Header surface                       |

[SpringSurface.vue](../components/SpringSurface.vue) and
[surface-motion.ts](../lib/surface-motion.ts) provide the shared movement for
dialogs, menus, page changes and tooltips. The spring is critically damped and
animates only translation and opacity. It does not scale container dimensions.
System reduced motion and Bot reduced/off preferences skip the animation.
Tooltips enter in 180 ms and leave in 120 ms, with no hover dismissal timer.

Use `BoostDialog` in the main app and `Modal` in Bot. Pass `busy` when closing
must be blocked during a save. Mark a pure cancel/close action with
`data-dialog-close` to run the exit transition before the parent close event.
Do not add it to inline confirmations or actions that merely change a form step.
Save/delete commands remain explicit; animation must not replay them.
Dialog scrolling remains accessible even though scrollbar chrome is hidden.

The Bot [SettingsBanner](../../../bot/frontend/src/components/SettingsBanner.vue)
is independent of form rows. Only its divider spans the whole content area;
normal form separators retain their original alignment. The active section is
derived from actual scroll position. Changing the banner must not remount forms,
discard drafts, or alter authorization.
