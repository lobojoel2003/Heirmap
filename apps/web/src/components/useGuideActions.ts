import type { GuideAction } from '../model/guide';
import { useStore } from '../store/store';

/** Run a guided-builder action against the store. */
export function useGuideActions() {
  const s = useStore();
  return (action: GuideAction) => {
    switch (action.kind) {
      case 'add-spouse':
        return void s.addSpouse(action.personId);
      case 'add-child': {
        const file = s.activeId ? s.cases[s.activeId] : undefined;
        const spouse = file?.tree.unions
          .filter((u) => u.partnerIds.includes(action.personId) && !u.endReason)
          .map((u) => (u.partnerIds[0] === action.personId ? u.partnerIds[1] : u.partnerIds[0]))
          .at(-1);
        return void s.addChild(spouse ? [action.personId, spouse] : [action.personId]);
      }
      case 'add-parent':
        return void s.addParent(action.personId);
      case 'add-sibling':
        return void s.addSibling(action.personId);
      case 'confirm': {
        const p = s.activeId
          ? s.cases[s.activeId]?.tree.people.find((x) => x.id === action.personId)
          : undefined;
        return s.updatePerson(action.personId, {
          confirmed: { ...p?.confirmed, [action.field]: true },
        });
      }
      case 'set-status':
        return s.updatePerson(action.personId, { status: action.status });
      case 'select':
        if (action.focus === 'deathDate') s.updatePerson(action.personId, { status: 'deceased' });
        return s.select(action.personId, action.focus ?? null);
      case 'paternity':
        return s.updateLink(action.linkId, { paternityEstablished: action.value });
      case 'edit-property':
        return s.setPropertyOpen(true);
    }
  };
}
