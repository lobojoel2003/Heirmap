import type { ParentChildLink, Person, Union } from '@heirmap/intestacy';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  newCase,
  parseCaseFile,
  uid,
  type CaseFile,
  type DocState,
  type NewCaseInput,
} from '../model/case';
import { sampleCase } from '../model/sample';

export type Tab = 'shares' | 'person' | 'documents' | 'law' | 'issues';
export type Report = 'chart' | 'checklist' | null;
export type Direction = 'LR' | 'TB';

const HISTORY_LIMIT = 60;

interface History {
  past: CaseFile[];
  future: CaseFile[];
}

export interface HeirmapState {
  cases: Record<string, CaseFile>;
  activeId: string | null;
  selectedId: string | null;
  tab: Tab;
  report: Report;
  asOf: string | null;
  focusField: string | null;
  propertyOpen: boolean;
  direction: Direction;
  history: History;

  createCase(input: NewCaseInput): void;
  loadSample(): void;
  importCase(json: unknown): CaseFile;
  openCase(id: string | null): void;
  deleteCase(id: string): void;
  renameCase(title: string): void;

  /** Apply an edit to the active case (recorded for undo). */
  edit(mutate: (draft: CaseFile) => void): void;
  undo(): void;
  redo(): void;

  select(id: string | null, focusField?: string | null): void;
  setTab(tab: Tab): void;
  setReport(report: Report): void;
  setAsOf(date: string | null): void;
  setPropertyOpen(open: boolean): void;
  setDirection(direction: Direction): void;

  addPerson(init?: Partial<Person>): string;
  updatePerson(id: string, patch: Partial<Person>): void;
  removePerson(id: string): void;
  addChild(parentIds: string[], init?: Partial<Person>): string;
  addSpouse(personId: string, init?: Partial<Person>): string;
  addParent(childId: string, init?: Partial<Person>): string;
  addSibling(personId: string): string | null;
  updateUnion(id: string, patch: Partial<Union>): void;
  removeUnion(id: string): void;
  updateLink(id: string, patch: Partial<ParentChildLink>): void;
  removeLink(id: string): void;
  linkParent(childId: string, parentId: string): void;
  setDocument(key: string, state: DocState): void;
}

function active(state: HeirmapState): CaseFile | undefined {
  return state.activeId ? state.cases[state.activeId] : undefined;
}

export const useStore = create<HeirmapState>()(
  persist(
    (set, get) => {
      const commit = (mutate: (draft: CaseFile) => void) => {
        const state = get();
        const current = active(state);
        if (!current) return;
        const draft = structuredClone(current);
        mutate(draft);
        draft.updatedAt = new Date().toISOString();
        set({
          cases: { ...state.cases, [draft.id]: draft },
          history: {
            past: [...state.history.past, current].slice(-HISTORY_LIMIT),
            future: [],
          },
        });
      };

      const newPerson = (init: Partial<Person> = {}): Person => ({
        id: uid('p'),
        name: '',
        status: 'living',
        ...init,
      });

      return {
        cases: {},
        activeId: null,
        selectedId: null,
        tab: 'shares',
        report: null,
        asOf: null,
        focusField: null,
        propertyOpen: false,
        direction: 'LR',
        history: { past: [], future: [] },

        createCase(input) {
          const file = newCase(input);
          set((s) => ({
            cases: { ...s.cases, [file.id]: file },
            activeId: file.id,
            selectedId: file.property.owners[0]?.personId ?? null,
            tab: 'person',
            asOf: null,
            history: { past: [], future: [] },
          }));
        },

        loadSample() {
          const file = sampleCase();
          set((s) => ({
            cases: { ...s.cases, [file.id]: file },
            activeId: file.id,
            selectedId: null,
            tab: 'shares',
            asOf: null,
            history: { past: [], future: [] },
          }));
        },

        importCase(json) {
          const file = parseCaseFile(json);
          const existing = get().cases[file.id];
          const id = existing ? uid('case') : file.id;
          const imported = { ...file, id };
          set((s) => ({
            cases: { ...s.cases, [id]: imported },
            activeId: id,
            selectedId: null,
            tab: 'shares',
            asOf: null,
            history: { past: [], future: [] },
          }));
          return imported;
        },

        openCase(id) {
          set({
            activeId: id,
            selectedId: null,
            asOf: null,
            report: null,
            history: { past: [], future: [] },
          });
        },

        deleteCase(id) {
          set((s) => {
            const cases = { ...s.cases };
            delete cases[id];
            return {
              cases,
              activeId: s.activeId === id ? null : s.activeId,
              selectedId: s.activeId === id ? null : s.selectedId,
              history: s.activeId === id ? { past: [], future: [] } : s.history,
            };
          });
        },

        renameCase(title) {
          commit((d) => {
            d.title = title;
          });
        },

        edit: commit,

        undo() {
          const s = get();
          const current = active(s);
          const prev = s.history.past.at(-1);
          if (!current || !prev) return;
          set({
            cases: { ...s.cases, [prev.id]: prev },
            history: { past: s.history.past.slice(0, -1), future: [current, ...s.history.future] },
          });
        },

        redo() {
          const s = get();
          const current = active(s);
          const next = s.history.future[0];
          if (!current || !next) return;
          set({
            cases: { ...s.cases, [next.id]: next },
            history: { past: [...s.history.past, current], future: s.history.future.slice(1) },
          });
        },

        select(id, focusField = null) {
          set((s) => ({ selectedId: id, focusField, tab: id ? 'person' : s.tab }));
        },
        setTab: (tab) => set({ tab }),
        setReport: (report) => set({ report }),
        setAsOf: (asOf) => set({ asOf }),
        setPropertyOpen: (propertyOpen) => set({ propertyOpen }),
        setDirection: (direction) => set({ direction }),

        addPerson(init) {
          const p = newPerson(init);
          commit((d) => {
            d.tree.people.push(p);
          });
          return p.id;
        },

        updatePerson(id, patch) {
          commit((d) => {
            const p = d.tree.people.find((x) => x.id === id);
            if (!p) return;
            Object.assign(p, patch);
            for (const [k, v] of Object.entries(patch)) {
              if (v === undefined) delete (p as unknown as Record<string, unknown>)[k];
            }
            if (p.status !== 'deceased') delete p.deathDate;
          });
        },

        removePerson(id) {
          commit((d) => {
            d.tree.people = d.tree.people.filter((p) => p.id !== id);
            d.tree.parentChild = d.tree.parentChild.filter(
              (l) => l.parentId !== id && l.childId !== id,
            );
            d.tree.unions = d.tree.unions.filter((u) => !u.partnerIds.includes(id));
            d.tree.exclusions = (d.tree.exclusions ?? []).filter(
              (e) => e.personId !== id && e.decedentId !== id,
            );
            d.property.owners = d.property.owners.filter((o) => o.personId !== id);
            for (const p of d.tree.people) {
              if (p.will) p.will.devises = p.will.devises.filter((x) => x.personId !== id);
            }
          });
          set((s) => ({ selectedId: s.selectedId === id ? null : s.selectedId }));
        },

        addChild(parentIds, init) {
          const child = newPerson({ name: 'New child', ...init });
          commit((d) => {
            d.tree.people.push(child);
            for (const parentId of parentIds) {
              d.tree.parentChild.push({
                id: uid('l'),
                parentId,
                childId: child.id,
                kind: 'biological',
              });
            }
          });
          set({ selectedId: child.id, tab: 'person', focusField: 'name' });
          return child.id;
        },

        addSpouse(personId, init) {
          const spouse = newPerson({ name: 'New spouse', ...init });
          const base = get().cases[get().activeId ?? '']?.tree.people.find(
            (p) => p.id === personId,
          );
          if (base?.sex === 'male') spouse.sex ??= 'female';
          if (base?.sex === 'female') spouse.sex ??= 'male';
          commit((d) => {
            d.tree.people.push(spouse);
            d.tree.unions.push({
              id: uid('u'),
              partnerIds: [personId, spouse.id],
              kind: 'marriage',
            });
          });
          set({ selectedId: spouse.id, tab: 'person', focusField: 'name' });
          return spouse.id;
        },

        addParent(childId, init) {
          const parent = newPerson({ name: 'New parent', status: 'unknown', ...init });
          commit((d) => {
            const existing = d.tree.parentChild.filter((l) => l.childId === childId);
            d.tree.people.push(parent);
            d.tree.parentChild.push({
              id: uid('l'),
              parentId: parent.id,
              childId,
              kind: 'biological',
            });
            // A second parent is assumed married to the first; the user can remove the marriage.
            const other = existing.find((l) => l.kind === 'biological');
            if (existing.length === 1 && other) {
              d.tree.unions.push({
                id: uid('u'),
                partnerIds: [other.parentId, parent.id],
                kind: 'marriage',
              });
            }
          });
          set({ selectedId: parent.id, tab: 'person', focusField: 'name' });
          return parent.id;
        },

        addSibling(personId) {
          const file = active(get());
          if (!file) return null;
          const parents = file.tree.parentChild
            .filter(
              (l) => l.childId === personId && (l.kind === 'biological' || l.kind === 'adopted'),
            )
            .map((l) => l.parentId);
          if (parents.length === 0) return null;
          return get().addChild(parents, { name: 'New sibling' });
        },

        updateUnion(id, patch) {
          commit((d) => {
            const u = d.tree.unions.find((x) => x.id === id);
            if (!u) return;
            Object.assign(u, patch);
            for (const [k, v] of Object.entries(patch)) {
              if (v === undefined || v === '') delete (u as unknown as Record<string, unknown>)[k];
            }
          });
        },

        removeUnion(id) {
          commit((d) => {
            d.tree.unions = d.tree.unions.filter((u) => u.id !== id);
          });
        },

        updateLink(id, patch) {
          commit((d) => {
            const l = d.tree.parentChild.find((x) => x.id === id);
            if (!l) return;
            Object.assign(l, patch);
            for (const [k, v] of Object.entries(patch)) {
              if (v === undefined) delete (l as unknown as Record<string, unknown>)[k];
            }
          });
        },

        removeLink(id) {
          commit((d) => {
            d.tree.parentChild = d.tree.parentChild.filter((l) => l.id !== id);
          });
        },

        linkParent(childId, parentId) {
          commit((d) => {
            if (d.tree.parentChild.some((l) => l.childId === childId && l.parentId === parentId))
              return;
            d.tree.parentChild.push({ id: uid('l'), parentId, childId, kind: 'biological' });
          });
        },

        setDocument(key, state) {
          commit((d) => {
            d.documents[key] = state;
          });
        },
      };
    },
    {
      name: 'heirmap:v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ cases: s.cases, activeId: s.activeId, direction: s.direction }),
    },
  ),
);

/** The active case, or undefined on the welcome screen. */
export function useActiveCase(): CaseFile | undefined {
  return useStore((s) => (s.activeId ? s.cases[s.activeId] : undefined));
}
