# @heirmap/intestacy

An open, citation-backed rules engine for **US intestate succession to land**, also called heirs'
property. Give it a family tree and the vesting deed. It applies each owner's death in date order,
under the version of the state's intestacy statute in force on that date, and returns every current
holder's exact fractional share. Each share comes with the chain of title and the statute sections
behind every step.

- Exact `bigint` fractions: shares always add up to exactly one.
- One module per state, with **dated rule versions**: Alabama, Georgia, Mississippi, North
  Carolina and South Carolina.
- Per stirpes, per capita with representation (1969 UPC), and per capita at each generation (1990
  UPC).
- Survival periods, half blood, common-law marriage cutoffs, paternity, adoption, wills, disclaimers
  and escheat.
- No runtime dependencies. ESM, fully typed. Apache-2.0.

> This library is a research aid, not legal advice. Each rule version reports a `confidence` level
> and lists its known gaps in `notes`.

## Install

From a release tarball (every [GitHub release](https://github.com/lobojoel2003/Heirmap/releases)
attaches one):

```bash
npm install ./heirmap-intestacy-1.0.0.tgz
```

## Quick start

```ts
import { computeShares } from '@heirmap/intestacy';

const result = computeShares(
  {
    people: [
      { id: 'o', name: 'Owner', sex: 'male', status: 'deceased', deathDate: '2010-05-01' },
      { id: 's', name: 'Spouse', sex: 'female', status: 'living' },
      { id: 'a', name: 'Ann', status: 'living' },
      { id: 'b', name: 'Ben', status: 'living' },
    ],
    parentChild: [
      { id: '1', parentId: 'o', childId: 'a', kind: 'biological' },
      { id: '2', parentId: 'o', childId: 'b', kind: 'biological' },
    ],
    unions: [{ id: 'u', partnerIds: ['o', 's'], kind: 'marriage' }],
  },
  { name: 'Home place', state: 'NC', owners: [{ personId: 'o' }] },
);

result.holdings.map((h) => [h.holder, h.share.toString()]);
// spouse 1/3 (N.C. Gen. Stat. § 29-14(a)(2)), Ann 1/3, Ben 1/3
```

## Data model

| Type              | Fields                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Person`          | `id`, `name`, `status` (`living` · `deceased` · `unknown`), `deathDate`, `birthDate`, `sex`, `will`, `estateValue`, `notes`                         |
| `ParentChildLink` | `parentId`, `childId`, `kind` (`biological` · `adopted` · `step` · `foster`), `paternityEstablished`, `adoptedAway`                                 |
| `Union`           | `partnerIds`, `kind` (`marriage` · `common-law`), `startDate`, `endDate`, `endReason` (`divorce` · `annulment`)                                     |
| `Exclusion`       | `personId` is treated as predeceasing `decedentId` (`disclaimer` · `slayer` · `other`)                                                              |
| `Property`        | `state`, `owners` (`personId` and an optional `share`), `tenancy` (`common` · `survivorship`), `county`, `parcelId`, `deedReference`, `deedDate`, … |

Dates use ISO `YYYY-MM-DD` format.

## Results

`computeShares(tree, property, { asOf? })` returns a `ShareResult`:

- `holdings`: who holds what now, or on the `asOf` date. A holder is a `person`, an `unresolved`
  person (whose status or date of death is unknown), or `escheat` to the state. Each holding lists
  every `path`, the chain of `TransferStep`s through which the share arrived.
- `estates`: one entry per decedent, with the rule version applied, the interest held at death and
  the `allocations` (fraction, role, citations and explanation for each recipient).
- `issues`: errors, warnings and notes to review, such as missing dates, unconfirmed paternity,
  survival close to the deadline, escheat, or a rule branch that needs review.
- `rulesUsed`, `total`, and the `property` itself.

Other exports:

- `buildDocumentChecklist(tree, property, result)` lists the deeds, certificates and records that
  prove each link.
- `validateCase(tree, property)` checks the tree's structure and dates.
- `describeRelationship(index, fromId, toId)` returns labels such as "first cousin once removed" or
  "daughter-in-law".
- `Fraction` does exact rational arithmetic.
- `STATES`, `getStateRules`, `selectVersion` give access to the rule registry.
- `stateHelpers` holds the building blocks for writing a state module.

## Writing a state module

A state is a `StateRules` object with sorted `versions`. Each version is a pure function from an
`EstateContext` to allocations that sum to exactly one:

```ts
const version: RuleVersion = {
  id: 'XX-2000',
  title: 'Example Probate Code',
  effectiveFrom: '2000-01-01',
  summary: 'Spouse takes half with issue; the rest to issue by representation…',
  sources: [cite('§ 1-2-3', 'Shares of heirs')],
  survival: { hours: 120, citation: cite('§ 1-2-4', '120-hour rule') },
  confidence: 'medium',
  notes: [],
  distribute(ctx) {
    const spouse = ctx.spouse();
    const issue = ctx.line(ctx.decedentId);
    // … use ctx.divide(lines, share, method), ctx.siblingLines(), stateHelpers.sideHalves(…), ctx.escheat()
  },
};
```

The engine asserts that every distribution sums to one. Look at `src/states/*.ts` for complete
examples, and add scenario tests under `test/` for each version.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
