import { formatDate } from './dates.js';
import { FamilyIndex } from './family.js';
import type { FamilyTree, Property, ShareResult } from './types.js';

export type DocumentCategory =
  | 'deed'
  | 'death'
  | 'probate'
  | 'marriage'
  | 'divorce'
  | 'adoption'
  | 'paternity'
  | 'identity'
  | 'research'
  | 'affidavit';

export interface DocumentItem {
  /** Stable key so a UI can remember the item's status between recomputations. */
  key: string;
  category: DocumentCategory;
  title: string;
  /** Why the document matters for this title. */
  reason: string;
  personIds: string[];
}

const CATEGORY_ORDER: DocumentCategory[] = [
  'deed',
  'death',
  'probate',
  'marriage',
  'divorce',
  'adoption',
  'paternity',
  'research',
  'identity',
  'affidavit',
];

/**
 * The deeds, certificates and records a family (or their attorney) will need
 * to prove the chain of title that the engine computed.
 */
export function buildDocumentChecklist(
  tree: FamilyTree,
  property: Property,
  result: ShareResult,
): DocumentItem[] {
  const index = new FamilyIndex(tree);
  const items = new Map<string, DocumentItem>();
  const add = (item: DocumentItem) => {
    if (!items.has(item.key)) items.set(item.key, item);
  };

  const ownerNames = property.owners.map((o) => index.name(o.personId)).join(' and ');
  add({
    key: 'deed:vesting',
    category: 'deed',
    title: `Vesting deed into ${ownerNames || 'the owner of record'}`,
    reason: `Shows how ${ownerNames || 'the owner'} acquired ${property.name || 'the property'}${property.deedReference ? ` (${property.deedReference})` : ''}. Get a certified copy from the ${property.county ? `${property.county} County ` : ''}deed records.`,
    personIds: property.owners.map((o) => o.personId),
  });
  add({
    key: 'deed:tax-plat',
    category: 'deed',
    title: `Current tax record and plat${property.parcelId ? ` for parcel ${property.parcelId}` : ''}`,
    reason:
      'Confirms the legal description, acreage and whether taxes are current (unpaid taxes put heirs property at risk of a tax sale).',
    personIds: [],
  });
  add({
    key: 'research:later-conveyances',
    category: 'research',
    title: 'Search the deed records for later conveyances by any heir',
    reason:
      'An heir may have sold or mortgaged a fractional interest. Any deed out of the family changes the shares computed here.',
    personIds: [],
  });

  const unionDocs = new Set<string>();
  for (const estate of result.estates) {
    const d = index.person(estate.decedentId);
    add({
      key: `death:${d.id}`,
      category: 'death',
      title: `Death certificate — ${d.name} (d. ${formatDate(d.deathDate)})`,
      reason: `Proves the date of death that fixes which ${result.property.state} statute applies (${estate.ruleVersion?.title ?? 'intestacy rules'}).`,
      personIds: [d.id],
    });
    if (estate.basis === 'will') {
      add({
        key: `probate:will:${d.id}`,
        category: 'probate',
        title: `Certified copy of the probated will of ${d.name}`,
        reason: `${d.name}'s interest passed under the will${d.will?.reference ? ` (${d.will.reference})` : ''}.`,
        personIds: [d.id],
      });
    } else {
      add({
        key: `probate:search:${d.id}`,
        category: 'probate',
        title: `Probate court search for ${d.name}`,
        reason: `Confirms that ${d.name} left no probated will and whether an estate was ever opened. A will would change these shares.`,
        personIds: [d.id],
      });
    }

    for (const alloc of estate.allocations) {
      if (alloc.to.kind === 'escheat') continue;
      const heirId = alloc.to.personId;
      // Marriage of a spouse who inherited.
      const unions = index.unionsBetween(d.id, heirId);
      for (const u of unions) {
        if (u.endReason || unionDocs.has(u.id)) continue;
        unionDocs.add(u.id);
        add({
          key: `marriage:${u.id}`,
          category: 'marriage',
          title: `Marriage ${u.kind === 'common-law' ? 'evidence (common-law)' : 'certificate'} — ${d.name} & ${index.name(heirId)}`,
          reason: `${index.name(heirId)} inherits as ${d.name}'s surviving spouse.`,
          personIds: [d.id, heirId],
        });
      }
      for (const id of [...alloc.via, heirId]) {
        for (const link of index.parentLinks(id)) {
          if (link.kind === 'adopted') {
            add({
              key: `adoption:${link.id}`,
              category: 'adoption',
              title: `Adoption decree — ${index.name(id)} (adopted by ${index.name(link.parentId)})`,
              reason:
                'Adopted children inherit as if born to the adoptive parent; the decree proves the relationship.',
              personIds: [id, link.parentId],
            });
          }
        }
      }
    }

    // Divorces that cut a former spouse out.
    for (const u of index.unionsOf(d.id)) {
      if (!u.endReason || unionDocs.has(u.id)) continue;
      unionDocs.add(u.id);
      const other = index.partnerIn(u, d.id);
      add({
        key: `divorce:${u.id}`,
        category: 'divorce',
        title: `${u.endReason === 'annulment' ? 'Annulment' : 'Divorce'} decree — ${d.name} & ${index.name(other)}`,
        reason: `Shows that ${index.name(other)} was no longer ${d.name}'s spouse and does not inherit as one.`,
        personIds: [d.id, other],
      });
    }
  }

  for (const issue of result.issues) {
    const ids = issue.personIds ?? [];
    if (issue.code === 'PATERNITY_UNCONFIRMED' && ids.length >= 2) {
      add({
        key: `paternity:${ids[0]}:${ids[1]}`,
        category: 'paternity',
        title: `Proof of paternity — ${index.name(ids[0]!)} (father ${index.name(ids[1]!)})`,
        reason:
          'A child born to unmarried parents inherits from the father only with legal proof of paternity (legitimation, court order, acknowledgment, or other evidence the statute allows).',
        personIds: ids,
      });
    }
    if (issue.code === 'DEATH_DATE_NEEDED' && ids[0]) {
      add({
        key: `death:${ids[0]}`,
        category: 'death',
        title: `Death certificate — ${index.name(ids[0])} (date of death needed)`,
        reason: 'The share cannot pass on until the date of death is known.',
        personIds: ids,
      });
    }
    if (issue.code === 'UNRESOLVED_SHARE' && ids[0]) {
      add({
        key: `research:status:${ids[0]}`,
        category: 'research',
        title: `Find out whether ${index.name(ids[0])} is living, and when they died if not`,
        reason: 'Part of the property cannot be assigned until this is known.',
        personIds: ids,
      });
    }
  }

  for (const h of result.holdings) {
    if (h.holder.kind !== 'person') continue;
    const p = index.person(h.holder.personId);
    add({
      key: `identity:${p.id}`,
      category: 'identity',
      title: `Current contact information and ID — ${p.name}`,
      reason: `${p.name} holds ${h.share.toString()} and will need to sign any deed, partition agreement or court filing.`,
      personIds: [p.id],
    });
  }

  add({
    key: 'affidavit:heirship',
    category: 'affidavit',
    title: 'Affidavit of heirship signed by disinterested witnesses',
    reason:
      'Witnesses who knew the family (but do not inherit) swear to the marriages, children and deaths shown on the family chart. Requirements vary by county — ask the clerk or a legal aid attorney.',
    personIds: [],
  });

  return [...items.values()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  );
}
