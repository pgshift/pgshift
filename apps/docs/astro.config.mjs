import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
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
            { label: 'Introduction', slug: '' },
            { label: 'Installation', slug: '' },
          ],
        },
        {
          label: 'Modules',
          items: [
            { label: 'Search', slug: '' },
            { label: 'Cache', slug: '' },
            { label: 'Queue', slug: '' },
            { label: 'Realtime', slug: '' },
          ],
        },
        {
          label: 'Adapters',
          items: [
            { label: 'search-postgres', slug: '' },
            { label: 'cache-postgres', slug: '' },
            { label: 'queue-postgres', slug: '' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Migration Hints', slug: '' },
            { label: 'PgShift + AI', slug: '' },
            { label: 'Contributing', slug: '' },
          ],
        },
      ],
    }),
  ],
})
