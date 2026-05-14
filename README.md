# Estrutura do Projeto

```
├── __tests__
│   ├── biome.json
│   ├── integration
│   │   ├── cache
│   │   │   └── cache.test.ts
│   │   ├── queue
│   │   │   └── queue.test.ts
│   │   ├── search
│   │   │   └── search.test.ts
│   │   ├── setup
│   │   │   ├── db.ts
│   │   │   └── global.ts
│   │   └── vector
│   │   │   └── vector.test.ts
│   ├── package.json
│   ├── unit
│   │   ├── core
│   │   │   ├── client.spec.ts
│   │   │   └── metrics.spec.ts
│   │   ├── cron
│   │   │   └── schedule.spec.ts
│   │   ├── search
│   │   │   └── query-builder.spec.ts
│   │   └── vector
│   │   │   ├── client.spec.ts
│   │   │   └── schema.spec.ts
│   └── vitest.config.ts
├── adapters
│   ├── cache-postgres
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   ├── adapter.ts
│   │   │   ├── index.ts
│   │   │   ├── pool.ts
│   │   │   └── schema.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   ├── cron-postgres
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   ├── adapter.ts
│   │   │   ├── index.ts
│   │   │   ├── pool.ts
│   │   │   ├── schedule.ts
│   │   │   └── schema.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   ├── queue-postgres
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   ├── adapter.ts
│   │   │   ├── index.ts
│   │   │   ├── pool.ts
│   │   │   ├── schema.ts
│   │   │   └── worker.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   ├── search-postgres
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   ├── adapter.ts
│   │   │   ├── index.ts
│   │   │   ├── pool.ts
│   │   │   ├── query-builder.ts
│   │   │   └── schema.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   └── vector-postgres
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   ├── adapter.ts
│   │   │   ├── index.ts
│   │   │   ├── pool.ts
│   │   │   └── schema.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
├── apps
│   └── docs
│   │   ├── astro.config.mjs
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── 404.html
│   │   │   ├── _astro
│   │   │   │   ├── Code.CT-1IQ2t.css
│   │   │   │   ├── MobileTableOfContents.astro_astro_type_script_index_0_lang.hwBsy0Mo.js
│   │   │   │   ├── Search.astro_astro_type_script_index_0_lang.Rw77DzG6.js
│   │   │   │   ├── TableOfContents.astro_astro_type_script_index_0_lang.FuRcXuRY.js
│   │   │   │   ├── common.uKTjHcpY.css
│   │   │   │   ├── ec.0vx5m.js
│   │   │   │   ├── ec.cyv7v.css
│   │   │   │   ├── logo.DWhwXXj_.svg
│   │   │   │   ├── page.B_tncCx8.js
│   │   │   │   ├── print.DNXP8c50.css
│   │   │   │   └── ui-core.D2oRCWSx.js
│   │   │   ├── adapters
│   │   │   │   ├── cache-postgres
│   │   │   │   │   └── index.html
│   │   │   │   ├── cron-postgres
│   │   │   │   │   └── index.html
│   │   │   │   ├── queue-postgres
│   │   │   │   │   └── index.html
│   │   │   │   └── search-postgres
│   │   │   │   │   └── index.html
│   │   │   ├── favicon.svg
│   │   │   ├── guides
│   │   │   │   ├── ai
│   │   │   │   │   └── index.html
│   │   │   │   ├── contributing
│   │   │   │   │   └── index.html
│   │   │   │   ├── getting-started
│   │   │   │   │   └── index.html
│   │   │   │   ├── installation
│   │   │   │   │   └── index.html
│   │   │   │   └── migration-hints
│   │   │   │   │   └── index.html
│   │   │   ├── index.html
│   │   │   ├── llm.txt
│   │   │   ├── logo.svg
│   │   │   ├── modules
│   │   │   │   ├── cache
│   │   │   │   │   └── index.html
│   │   │   │   ├── cron
│   │   │   │   │   └── index.html
│   │   │   │   ├── queue
│   │   │   │   │   └── index.html
│   │   │   │   └── search
│   │   │   │   │   └── index.html
│   │   │   └── pagefind
│   │   │   │   ├── fragment
│   │   │   │   │   ├── en_1a3f7cf.pf_fragment
│   │   │   │   │   ├── en_25a1e2c.pf_fragment
│   │   │   │   │   ├── en_2e3fc1d.pf_fragment
│   │   │   │   │   ├── en_5ac48cd.pf_fragment
│   │   │   │   │   ├── en_5c87d24.pf_fragment
│   │   │   │   │   ├── en_60aa841.pf_fragment
│   │   │   │   │   ├── en_7c94ae5.pf_fragment
│   │   │   │   │   ├── en_8e866d8.pf_fragment
│   │   │   │   │   ├── en_b4af987.pf_fragment
│   │   │   │   │   ├── en_bdbe3ff.pf_fragment
│   │   │   │   │   ├── en_d9cc2a5.pf_fragment
│   │   │   │   │   ├── en_dc67e5d.pf_fragment
│   │   │   │   │   ├── en_fa90619.pf_fragment
│   │   │   │   │   └── en_fe9abb1.pf_fragment
│   │   │   │   ├── index
│   │   │   │   │   └── en_271f38c.pf_index
│   │   │   │   ├── pagefind-component-ui.css
│   │   │   │   ├── pagefind-component-ui.js
│   │   │   │   ├── pagefind-entry.json
│   │   │   │   ├── pagefind-highlight.js
│   │   │   │   ├── pagefind-modular-ui.css
│   │   │   │   ├── pagefind-modular-ui.js
│   │   │   │   ├── pagefind-ui.css
│   │   │   │   ├── pagefind-ui.js
│   │   │   │   ├── pagefind-worker.js
│   │   │   │   ├── pagefind.en_696ff63c3c.pf_meta
│   │   │   │   ├── pagefind.js
│   │   │   │   ├── wasm.en.pagefind
│   │   │   │   └── wasm.unknown.pagefind
│   │   ├── package.json
│   │   ├── public
│   │   │   ├── favicon.svg
│   │   │   ├── llm.txt
│   │   │   └── logo.svg
│   │   ├── source
│   │   │   ├── content
│   │   │   │   └── docs
│   │   │   │   │   ├── adapters
│   │   │   │   │   │   ├── cache-postgres.md
│   │   │   │   │   │   ├── cron-postgres.md
│   │   │   │   │   │   ├── queue-postgres.md
│   │   │   │   │   │   └── search-postgres.md
│   │   │   │   │   ├── guides
│   │   │   │   │   │   ├── ai.mdx
│   │   │   │   │   │   ├── contributing.md
│   │   │   │   │   │   ├── getting-started.md
│   │   │   │   │   │   ├── installation.mdx
│   │   │   │   │   │   └── migration-hints.md
│   │   │   │   │   ├── index.mdx
│   │   │   │   │   └── modules
│   │   │   │   │   │   ├── cache.mdx
│   │   │   │   │   │   ├── cron.mdx
│   │   │   │   │   │   ├── queue.mdx
│   │   │   │   │   │   └── search.mdx
│   │   │   └── content.config.ts
│   │   └── tsconfig.json
├── examples
│   ├── cache-basic
│   │   ├── biome.json
│   │   ├── index.ts
│   │   ├── package.json
│   │   └── seed.ts
│   ├── cache-benchmark
│   │   ├── biome.json
│   │   ├── index.ts
│   │   ├── package.json
│   │   └── seed.ts
│   ├── cron-basic
│   │   ├── biome.json
│   │   ├── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── queue-basic
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
│   ├── queue-dead-letter
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
│   ├── queue-delay
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
│   ├── queue-priority
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
│   ├── queue-retry
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
│   ├── queue-stats
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
│   ├── search-basic
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
│   ├── search-basic-with-comments
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
│   ├── search-ranking
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
│   └── vector-basic
│   │   ├── biome.json
│   │   ├── index.ts
│   │   └── package.json
├── package-lock.json
├── package.json
├── packages
│   ├── cache
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   ├── core
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   ├── client.ts
│   │   │   ├── index.ts
│   │   │   ├── metrics.ts
│   │   │   └── types.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   ├── cron
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   ├── index.ts
│   │   │   └── schedule.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   ├── queue
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   ├── search
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   └── vector
│   │   ├── biome.json
│   │   ├── dist
│   │   │   ├── index.d.mts
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   ├── source
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
├── tooling
│   ├── lint
│   │   ├── biome.json
│   │   └── package.json
│   └── ts
│   │   ├── base.json
│   │   ├── node.json
│   │   └── package.json
└── turbo.json
```
