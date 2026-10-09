# Publishing arcreport-check

Status: ready to publish, **not published yet** (needs an npm account or token for ARC).

The npm name `arc-check` belongs to an unrelated package, so this publishes as `arcreport-check`. It installs two commands, `arcreport-check` and `arc-check`, so `npx arcreport-check <store>` works.

## npm

```bash
git clone https://github.com/abab7575/arc-open && cd arc-open
npm ci && npm test
cd packages/arc-check
npm pack --dry-run            # check the file list: bin, lib/checks.mjs, action.yml, README.md, LICENSE, package.json
npm publish --access public   # needs `npm login` (2FA) or NPM_TOKEN in ~/.npmrc
```

With a token instead of an interactive login:

```bash
cd packages/arc-check
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
npm publish --access public
rm .npmrc
```

Bump `version` in `package.json` before each later release.

## GitHub Action

The action lives at `packages/arc-check/action.yml`, so it is used as `abab7575/arc-open/packages/arc-check@<tag>`. Releases are tagged `vX.Y.Z` on this repo. Listing on the GitHub Marketplace needs `action.yml` at a repo root, so that would need its own small repo later.
