## [1.1.3](https://github.com/amirkabiri/qalam/compare/v1.1.2...v1.1.3) (2026-10-16)

### Bug Fixes

* **workspace:** reset the editor pane explicitly on document switch ([e9cdbae](https://github.com/amirkabiri/qalam/commit/e9cdbae59c015b7b6fd159ab08e2c436d44b4a3b))

## [1.1.2](https://github.com/amirkabiri/qalam/compare/v1.1.1...v1.1.2) (2026-10-16)

### Bug Fixes

* **preview:** float the ask-AI affordance for selections that overshoot the article ([17c90e4](https://github.com/amirkabiri/qalam/commit/17c90e400cdbc432323d6c475e260feec4e50121))

## [1.1.1](https://github.com/amirkabiri/qalam/compare/v1.1.0...v1.1.1) (2026-10-16)

### Bug Fixes

* **test:** move the shortcut drift contract to docs/SHORTCUTS.md ([e940cdb](https://github.com/amirkabiri/qalam/commit/e940cdbb5051fb7a89c2e915e144b85c0a5c6dc9))

## [1.1.0](https://github.com/amirkabiri/qalam/compare/v1.0.1...v1.1.0) (2026-10-16)

### Features

* **ui:** add the What's New changelog dialog ([d442538](https://github.com/amirkabiri/qalam/commit/d4425388801e1b4f3849e64046268865e26e226b))

## [1.0.1](https://github.com/amirkabiri/qalam/compare/v1.0.0...v1.0.1) (2026-10-16)

### Bug Fixes

* **release:** disable no-template-curly-in-string for semantic-release interpolation templates ([ae686e6](https://github.com/amirkabiri/qalam/commit/ae686e6f92c628b2cfc7563e0df892396ed72150))

## 1.0.0 (2026-10-16)

### Features

* **ai:** ChatProvider layer — built-in, OpenAI-compatible, Anthropic-compatible ([e9075b5](https://github.com/amirkabiri/qalam/commit/e9075b54b3deb8c527dcf0daeb3fd193f82c26b1))
* **ai:** direct document editing + selection-aware chat ([0e9116e](https://github.com/amirkabiri/qalam/commit/0e9116e7ec884d610bf071098ffad76f19b25a86))
* **ai:** feed a preview text selection to the agent with a prompt ([68f7158](https://github.com/amirkabiri/qalam/commit/68f7158de08da3def84e450b661e338cc92ac8e0))
* **ai:** on-device AI assistant panel (Prompt API / Gemini Nano) ([c42cb06](https://github.com/amirkabiri/qalam/commit/c42cb066e92d6569b277401b63f7e57ceef08e5e)), closes [#ai-btn](https://github.com/amirkabiri/qalam/issues/ai-btn)
* **ai:** pending-diff confirmation UX + v2 executor + panel wiring ([825fda3](https://github.com/amirkabiri/qalam/commit/825fda3bc0584bf7116957839483c51b59f129e7))
* **ai:** preview-excerpt handoff queue + excerpt-aware prompt assembly ([af02bf8](https://github.com/amirkabiri/qalam/commit/af02bf8b5b262c80613b2595fe71e800f25ada7b))
* **ai:** tool-agent loop — read/edit tools replace per-message buttons ([b3d197d](https://github.com/amirkabiri/qalam/commit/b3d197d13feb631effe5ebbbf40290df78dc381e))
* **ai:** v2 agent toolset — search/replace editing, pending-diff cards, modal write fix ([bab26dc](https://github.com/amirkabiri/qalam/commit/bab26dce2881fc9c89b76776db4d47309a95939b))
* **ai:** v2 toolset core — pure planners, tool-result services, raw-body fence grammar ([eed75d7](https://github.com/amirkabiri/qalam/commit/eed75d760c02700bf398b585cef0e4880b129a03))
* **app:** shell error boundary — a render error keeps a recovery UI instead of blanking the app ([57e12a0](https://github.com/amirkabiri/qalam/commit/57e12a0545dae9dea58e7693584ce007f130ad68))
* **editor:** floating selection toolbar — markdown formatting at the caret ([c573c8e](https://github.com/amirkabiri/qalam/commit/c573c8ee7fda6ebdb3275cd37177eb778883cdbb))
* **editor:** floating selection toolbar over the editor textarea ([0df9884](https://github.com/amirkabiri/qalam/commit/0df9884d6fd0e162e8903b5f89666b5e21d5038b))
* **editor:** line-number gutter aligned under soft wrap ([fa1b3b0](https://github.com/amirkabiri/qalam/commit/fa1b3b003f7bad902b26e173b542800d0a3d6eea))
* **editor:** line-number gutter aligned under soft wrap ([c0e1179](https://github.com/amirkabiri/qalam/commit/c0e1179f348c2da3708399bec86ba1a688ac8348))
* **editor:** pure markdown formatting actions for the selection toolbar ([b0ade64](https://github.com/amirkabiri/qalam/commit/b0ade644e44407dbe2ca0f9434ed81df9c6793c7))
* **editor:** selection toolbar formatting TOGGLES — unwrap/unify + active buttons ([99648d5](https://github.com/amirkabiri/qalam/commit/99648d5b0a9d192c395c26a01b8cc40427a8e0e7))
* **preview:** map preview text selections to source ranges + excerpts ([d9c97a8](https://github.com/amirkabiri/qalam/commit/d9c97a8c3309a0c696d102bca40129166938d005))
* **release:** semantic-release on main — auto tag, GitHub Release and CHANGELOG.md ([e539d04](https://github.com/amirkabiri/qalam/commit/e539d04bd6ac37d348d91b93afc9f779f79c28ad))
* **share:** [#d](https://github.com/amirkabiri/qalam/issues/d)= share-via-URL module (base64url + deflate-raw) ([15d109b](https://github.com/amirkabiri/qalam/commit/15d109ba9959c871e4e00b25a68de3a02e6f767f))
* **shortcuts:** conflict-free keymap — audit all bindings vs macOS/Windows/browsers ([61cb8f8](https://github.com/amirkabiri/qalam/commit/61cb8f8952701e21df0c06cd0aa7124f85646730))
* **shortcuts:** copyShareLink moves to Mod+Alt+Shift+K — plain Mod+Alt+U is View Source on mac Chrome/Safari ([b80b8dd](https://github.com/amirkabiri/qalam/commit/b80b8dd87b3f30ba68b005d336146f7cdbcf6ea1))
* **shortcuts:** move audited bindings into the conflict-free Mod+Alt family ([3153d5a](https://github.com/amirkabiri/qalam/commit/3153d5a4077981445628c3d34fa7d560b3049b71))
* **ui:** ask-AI-about-this affordance in the preview + composer excerpt chip ([9d764de](https://github.com/amirkabiri/qalam/commit/9d764de5feedc7a47ab556da48344fdb8fd8d3a9))
* **ui:** integrate share dialog, [#d](https://github.com/amirkabiri/qalam/issues/d)= routing and AI assistant button ([8bbf4ac](https://github.com/amirkabiri/qalam/commit/8bbf4ac429fd86551e3a19d91ec7a7e7b31e4cfb)), closes [#ai-btn](https://github.com/amirkabiri/qalam/issues/ai-btn) [#share-btn](https://github.com/amirkabiri/qalam/issues/share-btn)
* **ui:** one-click share + Qalam rebrand ([400f898](https://github.com/amirkabiri/qalam/commit/400f8980228ab144ba9d80ec9c8410536d5522d8))

### Bug Fixes

* **ai:** agent writes through the open panel no-op'd under the modal's inert content ([3042347](https://github.com/amirkabiri/qalam/commit/30423475587182783b4bdf67cefa6eff4f805bd1))
* **ai:** failed sends are visible — dead provider streams rethrow and render an error note (was: silently dropped bubble) ([8eedd95](https://github.com/amirkabiri/qalam/commit/8eedd957551312bb2528604089d875adcf7f9e3f))
* **app:** bounded shell layout — restore document scrolling ([b531f45](https://github.com/amirkabiri/qalam/commit/b531f45611977719ad799b25b1c9310a626e65f1)), closes [#root](https://github.com/amirkabiri/qalam/issues/root) [#root](https://github.com/amirkabiri/qalam/issues/root) [#root](https://github.com/amirkabiri/qalam/issues/root)
* **editor:** selection toolbar never steals focus — horizontal bar above the live selection ([fa5cce9](https://github.com/amirkabiri/qalam/commit/fa5cce959a84e4d4657ca172d2dc3beaf599ba9f))
* **preview:** re-anchor the deep-link jump — the webkit flake was a real bug ([c4be947](https://github.com/amirkabiri/qalam/commit/c4be9477f8e25a1554b374b3216cc90cc87927cb))
* **preview:** re-anchor the deep-link jump; land only on live nodes ([7a53152](https://github.com/amirkabiri/qalam/commit/7a53152ec83116969b01abd27a235741bac11098))
* **preview:** reset scroll on document switch only — typing keeps position ([bd6b6d6](https://github.com/amirkabiri/qalam/commit/bd6b6d62f6136e410c9deb82467d3538cd86b13e)), closes [#hash](https://github.com/amirkabiri/qalam/issues/hash)
* **readme:** reserve the logo's layout box (height=96) ([29b872d](https://github.com/amirkabiri/qalam/commit/29b872d4fc10e5e8ba3a7edef334cc36259ff4f3))

### Performance Improvements

* **build:** lazy-load highlight.js — entry bundle 799→650 kB min (257→207 gzip); hljs common set split to its own 154 kB chunk loaded on demand ([ec9b45b](https://github.com/amirkabiri/qalam/commit/ec9b45b47f6549f9bef4ededeaa4218972b7145f))
* byte-exact 10 MB cap check without the full encode() copy — byteLengthOver counting scan (the unit-count shortcut is unsound for multi-byte text) ([4d7c99a](https://github.com/amirkabiri/qalam/commit/4d7c99aaf5f27406e14a111a1b5edf42dbcde54c))
