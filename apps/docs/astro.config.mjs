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
            { label: 'Cache', slug: 'modules/cache' },
            { label: 'Queue', slug: 'modules/queue' },
          ],
        },
        {
          label: 'Adapters',
          items: [
            { label: 'search-postgres', slug: 'adapters/search-postgres' },
            { label: 'cache-postgres', slug: 'adapters/cache-postgres' },
            { label: 'queue-postgres', slug: 'adapters/queue-postgres' },
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
