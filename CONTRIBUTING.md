# Contributing to Heirmap

Thank you for helping families clear their titles. Contributions of every size are welcome: bug
reports, corrections from attorneys and paralegals, new state modules, historical rule versions,
accessibility fixes and translations.

## Ground rules

- **Cite everything.** Every rule must point to the statute section it implements, with a short
  quotation of the operative text where possible. If you are working from a case or a secondary
  source, say so in the version's `notes` and set `confidence` to match.
- **Never guess silently.** If the law is unsettled or the facts are missing, raise an issue
  (`needsReview(...)` or `ctx.issue(...)`) instead of picking an answer quietly.
- **Keep data on the device.** The app must never make network requests. The e2e suite checks this.
- **Be kind.** This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

```bash
corepack enable
```

```bash
pnpm install
```

```bash
pnpm check
```

`pnpm check` runs formatting, lint, typecheck and unit tests. Run `pnpm test:e2e` after
`pnpm --filter @heirmap/web build` for the browser tests.

## Adding a state or a rule version

1. Create `packages/intestacy/src/states/<code>.ts` exporting a `StateRules` object. Copy the
   structure of an existing module. `ms.ts` is the simplest; `nc.ts` shows collateral limits.
2. Give each version an `id` (`XX-YYYY`), an `effectiveFrom` date, a plain-language `summary`,
   `sources`, the `survival` rule, a `confidence` level and `notes` for anything unverified.
3. Register the state in `src/states/index.ts` and add its code to `StateCode` in `src/types.ts`.
4. Add scenario tests in `packages/intestacy/test/` for every branch: spouse and descendants,
   descendants only, spouse only, parents, siblings, grandparents, remote kin and escheat. Add a test
   for each date boundary between versions.
5. Update the state table in the README and the sources in `docs/rules.md`.

## Pull requests

- Branch from `main` and keep each pull request focused.
- Add or update tests. The library's coverage thresholds are enforced in CI.
- Add an entry under `## [Unreleased]` in `CHANGELOG.md`.
- Use clear commit messages in the imperative mood ("Add Florida rule module").

## Releases

Maintainers cut releases as described in the README under _Versioning, builds and releases_:
`pnpm version:set`, a changelog section, then a `vX.Y.Z` tag. CI does the rest.
