import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'node:url'
import starlightThemeFlexoki from 'starlight-theme-flexoki'

export default defineConfig({
  srcDir: fileURLToPath(new URL('./source', import.meta.url)),
  integrations: [
    starlight({
      plugins: [starlightThemeFlexoki()],
      title: 'PGShift Docs',
      tagline: 'Start with Postgres. Shift only when you must.',
      logo: {
        alt: 'PgShift',
        src: './public/logo.svg',
      },
      editLink: {
        baseUrl: 'https://github.com/mkafonso/pgshift/edit/main/apps/docs/',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/mkafonso/pgshift',
        },
      ],
      sidebar: [
        {
          label: 'Introduction',
          items: [
            { label: 'What is PgShift?', slug: 'guides/getting-started' },
            { label: 'Installation', slug: 'guides/installation' },
            { label: 'Migration Hints', slug: 'guides/migration-hints' },
          ],
        },
        {
          label: 'Modules',
          items: [
            { label: 'Search', slug: 'modules/search' },
            { label: 'Queue', slug: 'modules/queue' },
            { label: 'Cache', slug: 'modules/cache' },
            { label: 'Vector', slug: 'modules/vector' },
            { label: 'Cron', slug: 'modules/cron' },
            { label: 'State and Consensus', slug: 'modules/state' },
          ],
        },
        {
          label: 'Postgres Adapters',
          items: [
            {
              label: 'Search Adapter',
              slug: 'adapters/search-postgres',
            },
            {
              label: 'Queue Adapter',
              slug: 'adapters/queue-postgres',
            },
            {
              label: 'Cache Adapter',
              slug: 'adapters/cache-postgres',
            },
            {
              label: 'Cron Adapter',
              slug: 'adapters/cron-postgres',
            },
            {
              label: 'Vector Adapter',
              slug: 'adapters/vector-postgres',
            },
            {
              label: 'State and Consensus Adapter',
              slug: 'adapters/state-postgres',
            },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'AI Applications', slug: 'guides/ai' },
            { label: 'Contributing', slug: 'guides/contributing' },
          ],
        },
      ],
    }),
  ],
})
