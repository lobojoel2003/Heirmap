import type { Person } from '@heirmap/intestacy';
import { SCHEMA_VERSION, type CaseFile } from './case';

/**
 * A fictional Georgia family used for the tour and screenshots. Names,
 * places and records are invented. It exercises all three Georgia rule
 * versions, the widow's one-fifth minimum, the spouse's one-third minimum, a
 * probated will, a child of unmarried parents and an heir whose status is
 * unknown.
 */
export function sampleCase(): CaseFile {
  const people: Person[] = [
    {
      id: 'elijah',
      name: 'Elijah Freeman',
      sex: 'male',
      birthDate: '1890-04-12',
      status: 'deceased',
      deathDate: '1958-09-03',
      confirmed: { spouses: true, children: true },
    },
    {
      id: 'hattie',
      name: 'Hattie Freeman',
      sex: 'female',
      birthDate: '1894-08-30',
      status: 'deceased',
      deathDate: '1979-02-11',
      confirmed: { spouses: true, children: true },
    },
    {
      id: 'ruth',
      name: 'Ruth Freeman Daniels',
      sex: 'female',
      birthDate: '1913-05-02',
      status: 'deceased',
      deathDate: '1990-11-20',
      confirmed: { spouses: true, children: true },
    },
    {
      id: 'samuel',
      name: 'Samuel Daniels',
      sex: 'male',
      birthDate: '1910-01-15',
      status: 'deceased',
      deathDate: '1985-03-09',
    },
    {
      id: 'thomas',
      name: 'Thomas Daniels',
      sex: 'male',
      birthDate: '1938-07-21',
      status: 'unknown',
      notes: 'Moved to Detroit in the 1970s; the family lost touch.',
    },
    {
      id: 'clara',
      name: 'Clara Daniels Wright',
      sex: 'female',
      birthDate: '1941-10-03',
      status: 'deceased',
      deathDate: '2016-04-18',
      confirmed: { spouses: true, children: true },
    },
    { id: 'henry', name: 'Henry Wright', sex: 'male', birthDate: '1939-02-27', status: 'living' },
    {
      id: 'angela',
      name: 'Angela Wright',
      sex: 'female',
      birthDate: '1965-06-11',
      status: 'living',
    },
    { id: 'marcus', name: 'Marcus Wright', sex: 'male', birthDate: '1968-12-01', status: 'living' },
    {
      id: 'james',
      name: 'James Freeman',
      sex: 'male',
      birthDate: '1915-03-19',
      status: 'deceased',
      deathDate: '1944-06-06',
      notes: 'Killed in action, Normandy.',
      confirmed: { spouses: true, children: true },
    },
    {
      id: 'jt',
      name: 'James "J.T." Freeman Jr.',
      sex: 'male',
      birthDate: '1940-09-14',
      status: 'deceased',
      deathDate: '2002-01-27',
      confirmed: { spouses: true, children: true },
    },
    {
      id: 'lorraine',
      name: 'Lorraine Freeman',
      sex: 'female',
      birthDate: '1944-04-04',
      status: 'living',
    },
    {
      id: 'denise',
      name: 'Denise Freeman',
      sex: 'female',
      birthDate: '1966-02-08',
      status: 'living',
    },
    { id: 'kevin', name: 'Kevin Freeman', sex: 'male', birthDate: '1969-08-22', status: 'living' },
    {
      id: 'tasha',
      name: 'Tasha Freeman Hill',
      sex: 'female',
      birthDate: '1973-11-30',
      status: 'living',
    },
    {
      id: 'mae',
      name: 'Mae Freeman',
      sex: 'female',
      birthDate: '1918-12-25',
      status: 'deceased',
      deathDate: '2008-03-15',
      confirmed: { spouses: true, children: true, parents: true, siblings: true },
    },
    {
      id: 'lucius',
      name: 'Lucius Freeman',
      sex: 'male',
      birthDate: '1921-06-07',
      status: 'deceased',
      deathDate: '2011-07-30',
      confirmed: { spouses: true },
    },
    {
      id: 'odessa',
      name: 'Odessa Freeman',
      sex: 'female',
      birthDate: '1925-09-09',
      status: 'deceased',
      deathDate: '2015-10-02',
      confirmed: { spouses: true, children: true },
    },
    {
      id: 'ronald',
      name: 'Ronald Freeman',
      sex: 'male',
      birthDate: '1950-03-03',
      status: 'living',
    },
    {
      id: 'beverly',
      name: 'Beverly Freeman Ross',
      sex: 'female',
      birthDate: '1953-07-16',
      status: 'living',
    },
    {
      id: 'calvin',
      name: 'Calvin Freeman',
      sex: 'male',
      birthDate: '1947-05-20',
      status: 'living',
      notes: 'Son of Lucius and Ida Mae Carter, who did not marry.',
    },
    {
      id: 'ida',
      name: 'Ida Mae Carter',
      sex: 'female',
      birthDate: '1927-01-01',
      status: 'deceased',
      deathDate: '1999-08-08',
    },
    {
      id: 'willie',
      name: 'Willie Freeman',
      sex: 'male',
      birthDate: '1925-02-01',
      status: 'deceased',
      deathDate: '1925-08-15',
      notes: 'Died in infancy.',
      confirmed: { spouses: true, children: true },
    },
    {
      id: 'lena',
      name: 'Lena Freeman Brooks',
      sex: 'female',
      birthDate: '1928-10-10',
      status: 'deceased',
      deathDate: '2020-01-05',
      will: {
        probated: true,
        devises: [{ personId: 'gloria', share: '1' }],
        reference: 'Greene County Probate Court, Estate No. 2020-014',
      },
      confirmed: { spouses: true, children: true },
    },
    {
      id: 'gloria',
      name: 'Gloria Brooks',
      sex: 'female',
      birthDate: '1955-04-01',
      status: 'living',
    },
  ];

  const parentChild: CaseFile['tree']['parentChild'] = [];
  const link = (
    parentIds: string[],
    childId: string,
    extra: Partial<CaseFile['tree']['parentChild'][number]> = {},
  ) => {
    for (const parentId of parentIds) {
      parentChild.push({
        id: `l_${parentId}_${childId}`,
        parentId,
        childId,
        kind: 'biological',
        ...extra,
      });
    }
  };
  for (const c of ['ruth', 'james', 'mae', 'lucius', 'willie', 'lena'])
    link(['elijah', 'hattie'], c);
  link(['ruth', 'samuel'], 'thomas');
  link(['ruth', 'samuel'], 'clara');
  link(['clara', 'henry'], 'angela');
  link(['clara', 'henry'], 'marcus');
  link(['james'], 'jt');
  link(['jt', 'lorraine'], 'denise');
  link(['jt', 'lorraine'], 'kevin');
  link(['jt', 'lorraine'], 'tasha');
  link(['lucius', 'odessa'], 'ronald');
  link(['lucius', 'odessa'], 'beverly');
  link(['lucius', 'ida'], 'calvin');
  link(['lena'], 'gloria');

  const unions: CaseFile['tree']['unions'] = [
    {
      id: 'u_elijah_hattie',
      partnerIds: ['elijah', 'hattie'],
      kind: 'marriage',
      startDate: '1912-06-16',
    },
    {
      id: 'u_ruth_samuel',
      partnerIds: ['ruth', 'samuel'],
      kind: 'marriage',
      startDate: '1936-08-01',
    },
    {
      id: 'u_clara_henry',
      partnerIds: ['clara', 'henry'],
      kind: 'marriage',
      startDate: '1963-05-25',
    },
    {
      id: 'u_jt_lorraine',
      partnerIds: ['jt', 'lorraine'],
      kind: 'marriage',
      startDate: '1964-09-12',
    },
    {
      id: 'u_lucius_odessa',
      partnerIds: ['lucius', 'odessa'],
      kind: 'marriage',
      startDate: '1949-04-30',
    },
  ];

  return {
    schema: SCHEMA_VERSION,
    id: 'sample-freeman',
    title: 'Freeman home place (sample)',
    property: {
      name: 'Freeman home place',
      state: 'GA',
      county: 'Greene',
      parcelId: '042-0017',
      acreage: 38.5,
      legalDescription:
        'Fictional example: 38.5 acres, more or less, in Land Lot 117 of the 3rd District, Greene County, Georgia.',
      deedReference: 'Deed Book 14, page 220',
      deedDate: '1921-11-07',
      owners: [{ personId: 'elijah' }],
      tenancy: 'common',
    },
    tree: { people, parentChild, unions, exclusions: [] },
    documents: {
      'deed:vesting': {
        status: 'obtained',
        note: 'Certified copy from the Clerk of Superior Court.',
      },
      'death:elijah': { status: 'obtained' },
      'death:hattie': { status: 'requested' },
    },
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
  };
}
