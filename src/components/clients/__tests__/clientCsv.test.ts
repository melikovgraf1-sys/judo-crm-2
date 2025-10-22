import type { Client, DB } from '../../../types';

jest.mock('../../../state/utils', () => ({
  __esModule: true,
  uid: jest.fn(),
  todayISO: jest.fn(),
}));

import { appendImportedClients } from '../clientCsv';
import { uid, todayISO } from '../../../state/utils';

const asMock = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.MockedFunction<T>;

const makeDB = (overrides: Partial<DB> = {}): DB => ({
  revision: 0,
  clients: [],
  attendance: [],
  performance: [],
  schedule: [],
  leads: [],
  leadsArchive: [],
  leadHistory: [],
  tasks: [],
  tasksArchive: [],
  staff: [{ id: 's1', role: 'Тренер', name: 'Coach', areas: ['Area1'], groups: ['Group1'] }],
  settings: {
    areas: ['Area1'],
    groups: ['Group1'],
    limits: {},
    rentByAreaEUR: {},
    coachSalaryByAreaEUR: {},
    currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
    coachPayFormula: '',
    analyticsFavorites: [],
  },
  changelog: [],
  ...overrides,
});

const baseCandidate = (): Omit<Client, 'id'> => ({
  firstName: 'Импорт',
  lastName: '',
  parentName: '',
  phone: '',
  whatsApp: '',
  telegram: '',
  instagram: '',
  channel: 'Telegram',
  birthDate: '2010-01-01T00:00:00.000Z',
  gender: 'м',
  area: 'Area1',
  group: 'Group1',
  coachId: 's1',
  startDate: '2024-01-01T00:00:00.000Z',
  payMethod: 'перевод',
  payStatus: 'ожидание',
  status: 'новый',
  subscriptionPlan: 'monthly',
  payDate: '2024-01-10T00:00:00.000Z',
  payAmount: 100,
  payActual: 100,
  remainingLessons: 5,
  placements: [
    {
      id: 'pl-base',
      area: 'Area1',
      group: 'Group1',
      payMethod: 'перевод',
      payStatus: 'ожидание',
      status: 'новый',
      subscriptionPlan: 'monthly',
      payDate: '2024-01-10T00:00:00.000Z',
      payAmount: 100,
      payActual: 100,
      remainingLessons: 5,
    },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  let counter = 0;
  asMock(uid).mockImplementation(() => `uid-${++counter}`);
  asMock(todayISO).mockReturnValue('2024-01-01T00:00:00.000Z');
});

describe('appendImportedClients', () => {
  test('skips existing duplicates and merges imported duplicates', () => {
    const existing: Client = {
      id: 'c-existing',
      firstName: 'Иван',
      lastName: 'Иванов',
      parentName: '',
      phone: '+7 (900) 123-45-67',
      whatsApp: '',
      telegram: '',
      instagram: '',
      channel: 'Telegram',
      birthDate: '2010-01-01T00:00:00.000Z',
      gender: 'м',
      area: 'Area1',
      group: 'Group1',
      coachId: 's1',
      startDate: '2024-01-01T00:00:00.000Z',
      payMethod: 'перевод',
      payStatus: 'ожидание',
      status: 'новый',
      subscriptionPlan: 'monthly',
      payDate: '2024-01-10T00:00:00.000Z',
      payAmount: 120,
      payActual: 120,
      remainingLessons: 8,
      placements: [
        {
          id: 'pl-existing',
          area: 'Area1',
          group: 'Group1',
          payMethod: 'перевод',
          payStatus: 'ожидание',
          status: 'новый',
          subscriptionPlan: 'monthly',
          payDate: '2024-01-10T00:00:00.000Z',
          payAmount: 120,
          payActual: 120,
          remainingLessons: 8,
        },
      ],
    };

    const db = makeDB({ clients: [existing] });

    const imported: Omit<Client, 'id'>[] = [
      {
        ...baseCandidate(),
        firstName: 'Иван',
        lastName: 'Иванов',
        phone: '8 (900) 1234567',
      },
      {
        ...baseCandidate(),
        firstName: 'Пётр',
        lastName: 'Сидоров',
        telegram: '@petr',
        payAmount: 150,
        payActual: 150,
      },
      {
        ...baseCandidate(),
        firstName: 'Petr',
        lastName: 'Sidorov',
        telegram: 'https://t.me/petr',
        instagram: 'https://instagram.com/petr',
        payAmount: 160,
        payActual: 160,
      },
    ];

    const result = appendImportedClients(db, imported);

    expect(result.summary).toMatchObject({ added: 1, skipped: 1, merged: 1 });
    expect(result.next.clients).toHaveLength(db.clients.length + 1);

    const newClient = result.next.clients[0];
    expect(newClient.id).toBe('uid-1');
    expect(newClient.firstName).toBe('Пётр');
    expect(newClient.telegram).toBe('@petr');
    expect(newClient.instagram).toBe('https://instagram.com/petr');

    const existingDuplicate = result.summary.duplicates.find(entry => entry.type === 'existing');
    expect(existingDuplicate?.client.id).toBe('c-existing');
    expect(existingDuplicate?.matches.map(match => match.field)).toContain('phone');

    const mergedDuplicate = result.summary.duplicates.find(entry => entry.type === 'imported');
    expect(mergedDuplicate?.client.id).toBe(newClient.id);
    expect(mergedDuplicate?.matches.map(match => match.field)).toContain('telegram');

    expect(result.changelogMessage).toBe('Добавлено клиентов: 1');
    expect(result.next.changelog).toHaveLength(1);
    expect(result.next.changelog[0]).toMatchObject({ what: 'Импортировано клиентов из CSV: 1' });
  });
});
