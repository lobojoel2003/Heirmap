# Changelog

All notable changes to Heirmap are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Builds carry SemVer build metadata,
`<version>+<build number>.<commit>`, for example `1.0.0+42.3c1224e`.

## [Unreleased]

## [1.0.0] - 2026-11-19

The first public release of Heirmap: a guided family-tree builder and an open,
citation-backed intestacy rules engine for untangling heirs' property titles.

### Rules engine (`@heirmap/intestacy`, Apache-2.0)

- Exact fractional shares with `bigint` rational arithmetic, so totals always
  add up to exactly one.
- Chain-of-title engine: applies the vesting deed, then every owner's death in
  date order under the statute in force on that date, through as many
  generations as the family tree holds. It supports co-owners (tenants in
  common or with right of survivorship), probated wills with partial intestacy
  and lapse, disclaimers and slayer exclusions, and an "as of" date for
  historical ownership.
- One module per state, each with dated rule versions, statute citations,
  quotations and a stated confidence level:
  - **Alabama:** statute of descents (before May 28, 1980), the 1980 amendment,
    and the Probate Code (from 1983), including the dollar-amount spouse shares.
  - **Georgia:** Code 1933 / O.C.G.A. § 53-4-2 (widow's one-fifth minimum), the
    1985 amendment (one-fourth), and the Revised Probate Code of 1998
    (one-third).
  - **Mississippi:** the descent statute before and after the Uniform
    Simultaneous Death Law (1956) and the nonmarital-children reform (1981).
  - **North Carolina:** the Intestate Succession Act (1960) and the 120-hour
    survival rule (2007).
  - **South Carolina:** the Statute of Distributions (before 1987), the
    Probate Code (1987), and the 2013 revisions (2014).
- Representation methods: per stirpes, per capita with representation (1969
  UPC), and per capita at each generation (1990 UPC).
- Legal details the engine handles: survival periods (120 hours, five days,
  simultaneous deaths), half-blood rules including Mississippi's whole-blood
  preference, the cutoff date for common-law marriages in each state,
  paternity for children of unmarried parents, adoption, stepchildren,
  posthumous heirs, collateral-degree limits, and escheat.
- Unresolved shares: an heir whose status or date of death is unknown is shown
  as unresolved and is never guessed.
- Plain-English kinship labels, a validation pass for the tree, and a
  checklist of the deeds and records that prove each link.

### Web app (`@heirmap/web`, AGPL-3.0)

- A guided builder that works forward from the owner of record, one generation
  at a time, asking only the questions the calculation needs.
- An interactive family tree (React Flow) with left-to-right and top-down
  layouts, quick "add spouse / child / parent / sibling" actions, and undo and
  redo.
- A shares view: a pie chart colored by family branch, a ranked table with
  exact fractions and a common-denominator view, and the full chain of title
  for every share, with each step linked to its statute.
- A timeline slider to see who owned the land after each death.
- A law panel listing every rule version, its confidence level and known gaps.
- Exports: a printable family chart for an affidavit of heirship (or save as
  PDF), the chart as SVG, a document checklist (print, CSV, Markdown), shares
  as CSV, and the case file as JSON.
- Local-only storage. Cases stay in the browser, and a strict Content Security
  Policy blocks all network connections.
- Light and dark themes, keyboard support and responsive layouts.

### Project

- CI: formatting, lint, typecheck and unit tests on Node 20 and 22, with
  coverage reports, packaged build artifacts and Playwright end-to-end tests.
- Release workflow: tag `vX.Y.Z` to verify, build and publish a GitHub release
  with the web app zip, the library tarball, build info and SHA-256 checksums.
- GitHub Pages deployment of the hosted app from `main`.

[Unreleased]: https://github.com/lobojoel2003/Heirmap/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lobojoel2003/Heirmap/releases/tag/v1.0.0
