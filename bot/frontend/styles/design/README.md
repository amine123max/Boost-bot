# Boost Bot design styles

These are the existing Boost Bot styles used by the Vue workspace and specialist
Bot sandbox. Directory restructuring preserves their layout, colors and motion.

| Source | Responsibility |
| --- | --- |
| `index.css` | CSS layer order and imports |
| `tokens/` | Primitive values, light/dark semantic colors and motion tokens |
| `base/` | Reset, typography, utilities and keyframes |
| `components/` | Shared control styles, including avatars and status backgrounds |
| `../css/` | Workspace shell, chat, settings and specialist page styles |

Vue components live in `../../src/components/`. Specialist sandbox components
live in `../../compat/botkit/`. Fonts and icons come from `../../../assets/web/`.
`npm --prefix bot run build` copies runtime styles to `bot/dist/ui/` while keeping
the existing `/boost-bot/amb/static/` and sandbox asset URLs stable.

Use semantic tokens for both themes, respect reduced motion, and keep page styles
inside `@layer app`. Status colors supplement visible status text. Explanatory
help belongs in accessible hover/focus hints; execution records expand inline.
Do not place credentials, implementation notes or fabricated runtime data in UI.

The superseded Preact workspace, design gallery and its test runners have been
removed. Validate style changes in the authenticated Vue workspace and specialist
previews at desktop and narrow widths. See the repository's `TESTING.md` for the
build checks, retained inline Rust unit tests and runtime acceptance.
