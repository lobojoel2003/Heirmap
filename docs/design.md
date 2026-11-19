# Design notes

## Layout

The workspace has three columns: the **guided builder** on the left, the **family tree** in the
middle, and **details** on the right (Shares, Person, Documents, Law, Review). The tree is laid out
with dagre. Each couple, and each single recorded parent, gets a small connector node, so every
generation sits in its own column (left to right) or row (top down). Left to right is the default
because families with many siblings fit a laptop screen and a printed page better that way.

## Share chart

The spec asks for a pie of fractional shares. The pie answers "how is the whole split?" at a glance,
and the ranked table beside it answers "who holds more?" with exact fractions, percentages and bars.
The table also serves as the accessible view of the chart.

- **Color follows the family branch**, meaning the owner's child (or other first heir) through whom
  the share descends. Colors never follow a holder's size or rank, and branches are ordered by birth
  so colors stay stable as shares change.
- **Categorical palette.** Eight validated slots, with separate light and dark steps. The light
  palette passes the CVD-separation and normal-vision checks for adjacent pairs; three slots fall
  below 3:1 contrast on the light surface, which the always-visible table and legend make up for.
  A ninth branch or more folds into "Other lines" instead of generating a new hue.

  | Slot | Light     | Dark      |
  | ---- | --------- | --------- |
  | 1    | `#2a78d6` | `#3987e5` |
  | 2    | `#eb6834` | `#d95926` |
  | 3    | `#1baf7a` | `#199e70` |
  | 4    | `#eda100` | `#c98500` |
  | 5    | `#e87ba4` | `#d55181` |
  | 6    | `#008300` | `#0ca30c` |
  | 7    | `#6250d6` | `#9085e9` |
  | 8    | `#e34948` | `#e66767` |

- **Unresolved shares** use a neutral gray with a 45° hatch, so they never read as a branch. Escheat
  uses a dark neutral.
- Slices are separated by a 2px surface-colored gap. Hovering or focusing a slice shows its holder
  and share, and clicking it opens that share's chain of title.

## Printing

Reports (the affidavit family chart and the document checklist) render on a white "paper" sheet
with print CSS that hides the app chrome. The family chart is plain black-on-white SVG, so it prints
and photocopies cleanly.
