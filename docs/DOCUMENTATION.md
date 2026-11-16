# Documentation standards

[简体中文](DOCUMENTATION.zh-CN.md) · [Documentation index](README.md)

## Audience and structure

Public guides are maintained as English/Simplified Chinese pairs. Root and module README files help readers evaluate, start and contribute. Detailed architecture, runtime configuration, protocols, deployment and acceptance live in dedicated guides.

README retains the project identity, community acknowledgement, current screenshots with flat labels and spacing, technical scope, an overall data-flow diagram, latest-release links and Star history. Technology-specific diagrams follow in the architecture guide. Do not add release-by-release UI trivia or repeated API examples to the overview.

## Pair management

| Document family | Convention |
| --- | --- |
| Root/module guide | NAME.md and NAME.zh-CN.md |
| Existing language manuals | docs/en and docs/zh-CN with explicit pair mapping |
| Release notes | Matching English/Chinese files; workflow publishes paired content |
| Third-party legal notices | Translated explanations; original license grant remains verbatim |

The machine-readable [pair registry](documentation-pairs.json) names each maintained public pair. Existing Russian/Korean translations remain additional locale material. Bundled personas, skill instructions and template Markdown are runtime/vendor inputs, not renamed by public-guide maintenance; local implementation plans and task records are excluded from Git. They retain their entry semantics and provenance rather than receiving placeholder translations.

For a behavior/default change, update both paired versions in the same delivery. Preserve equivalent scope, not identical word count. Navigation and diagrams must lead to the matching locale. A bilingual title in one file is not a substitute for a paired guide.

## Technical accuracy

State current behavior, effective limits, identity/process boundaries and failure semantics. Distinguish proposed work, inline/mock evidence, real upstream acceptance and platform checks. Provide source references for defaults and method names; generate repetitive inventories from current dispatch where possible.

Configuration tables include value type, default, required status, scope and purpose. Keep bootstrap/private fields separate from runtime settings. Environment examples contain no live secrets. Unknown metrics remain unknown.

## Links, images and evidence

Use relative repository links and purpose-labelled external links. Images have alt text, current-version scope and no private data. Preserve aspect ratio and whitespace; use one-level labels. Architecture diagrams begin with a small business data-flow overview and then separate RPC, inference, storage, Bot and Nginx views.

Measurements state hardware, build mode, load, duration, input size and mock/real source. Separate accepted/rejected latency distributions. Do not use a short load sample as proof against all leaks or overload.

## Review and release

Run node scripts/check-repository.mjs and node scripts/check-documentation.mjs. Review generated pair coverage, local links, diagrams, screenshots, toolchain prerequisites and latest-release references. Build/runtime commands must be recorded accurately; unexecuted clean-machine or target-platform checks remain explicit.

The existing release workflow is a release build, not a claimed PR CI pipeline. Published version metadata, source commit, signed manifest and assets must agree. Remove outdated promises and platform lists when source or distribution changes.
