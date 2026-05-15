# Changesets

This directory contains pending changesets — files that describe changes
that have not yet been released.

## How to add a changeset

After making changes to one or more packages, run:

```bash
npx changeset
```

Select the packages you changed, choose the bump type (patch/minor/major),
and write a short description of what changed.

Commit the generated `.md` file alongside your code changes.

## How releases work

When changesets are merged into `main`, the release workflow automatically:

1. Opens a "Version Packages" PR that bumps versions and updates CHANGELOGs
2. When that PR is merged, publishes all changed packages to npm

## Bump types

- **patch** — bug fixes, internal changes, documentation (`0.1.0` → `0.1.1`)
- **minor** — new features, backwards compatible (`0.1.0` → `0.2.0`)
- **major** — breaking changes (`0.1.0` → `1.0.0`)
