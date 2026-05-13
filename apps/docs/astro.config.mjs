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
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'guides/getting-started' },
            { label: 'Installation', slug: 'guides/installation' },
          ],
        },
        {
          label: 'Modules',
          items: [
            { label: 'Search', slug: 'modules/search' },
            { label: 'Queue', slug: 'modules/queue' },
            { label: 'Cache', slug: 'modules/cache' },
            { label: 'Cron', slug: 'modules/cron' },
          ],
        },
        {
          label: 'Adapters',
          items: [
            {
              label: 'Search postgres adapter',
              slug: 'adapters/search-postgres',
            },
            {
              label: 'Queue postgres adapter',
              slug: 'adapters/queue-postgres',
            },
            {
              label: 'Cache postgres adapter',
              slug: 'adapters/cache-postgres',
            },
            {
              label: 'Cron postgres adapter',
              slug: 'adapters/cron-postgres',
            },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Migration Hints', slug: 'guides/migration-hints' },
            { label: 'PgShift + AI', slug: 'guides/ai' },
            { label: 'Contributing', slug: 'guides/contributing' },
          ],
        },
      ],
    }),
  ],
})
