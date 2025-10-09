// @ts-nocheck
import '@testing-library/jest-dom';
import { act, renderHook, waitFor } from '@testing-library/react';

const mockPush = jest.fn();
const FIXED_TODAY = '2024-05-10T00:00:00.000Z';

jest.mock(
  'react-router-dom',
  () => ({
    __esModule: true,
    useLocation: () => ({ pathname: '/' }),
    useNavigate: () => jest.fn(),
  }),
  { virtual: true },
);

jest.mock('../../components/Toasts', () => ({
  __esModule: true,
  useToasts: () => ({ toasts: [], push: mockPush }),
}));

jest.mock('../../firebase', () => ({
  __esModule: true,
  db: undefined,
  ensureSignedIn: jest.fn().mockResolvedValue(false),
}));

import { commitDBUpdate, DB_CONFLICT_EVENT, LS_KEYS, LOCAL_ONLY_MESSAGE, useAppState } from '../appState';
import type { TaskItem } from '../../types';
import { RESERVE_AREA_NAME } from '../reserve';
import * as seedModule from '../seed';

const { makeSeedDB } = seedModule;

describe('useAppState with local persistence', () => {
  beforeEach(() => {
    mockPush.mockClear();
    localStorage.clear();
  });

  it('commits updates locally when Firestore is disabled', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAppState());

    await act(async () => {});

    expect(mockPush).toHaveBeenCalledWith(LOCAL_ONLY_MESSAGE, 'warning');

    const next = {
      ...result.current.db,
      changelog: [
        ...result.current.db.changelog,
        { id: 'local-change', who: 'Тест', what: 'Локальное сохранение', when: new Date().toISOString() },
      ],
    };

    let persisted;
    await act(async () => {
      persisted = await commitDBUpdate(next, result.current.setDB);
    });

    expect(persisted).toEqual({ ok: true, db: next });
    expect(result.current.db).toEqual(next);

    const stored = localStorage.getItem(LS_KEYS.db);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual(next);

    const errorToastCalls = mockPush.mock.calls.filter(([, type]) => type === 'error');
    expect(errorToastCalls).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('allows logging in with predefined admin credentials', async () => {
    const { result } = renderHook(() => useAppState());

    let loginResult;
    await act(async () => {
      loginResult = await result.current.loginUser('admin1', 'admin1');
    });

    expect(loginResult).toEqual({ ok: true });
    expect(result.current.currentUser).not.toBeNull();
    expect(result.current.currentUser?.login).toBe('admin1');
  });

  it('ensures the reserve area is available even if missing from stored settings', async () => {
    const legacy = seedModule.makeSeedDB();
    legacy.settings.areas = legacy.settings.areas.filter(area => area !== RESERVE_AREA_NAME);
    localStorage.setItem(LS_KEYS.db, JSON.stringify(legacy));

    const { result } = renderHook(() => useAppState());
    await act(async () => {});

    expect(result.current.db.settings.areas).toContain(RESERVE_AREA_NAME);
  });

  it('normalizes legacy group names in stored data', async () => {
    const legacy = makeSeedDB();
    const legacyGroups = [
      '4-6',
      '6-9',
      '9-14',
      '7-14',
      'взрослые',
      'индивидуальные',
      'доп. группа',
    ];
    legacy.settings.groups = legacyGroups;
    legacy.settings.limits = Object.fromEntries(
      legacy.settings.areas.flatMap(area => legacyGroups.map(group => [`${area}|${group}`, 15])),
    );

    if (legacy.clients.length > 0) {
      legacy.clients[0].group = '6-9';
    }
    if (legacy.clients.length > 1) {
      legacy.clients[1].group = '11 и старше';
    }

    if (legacy.schedule.length > 0) {
      legacy.schedule[0].group = '9-14';
    }

    legacy.staff = legacy.staff.map(member => ({
      ...member,
      groups: ['4-6', '6-9', '7-14'],
    }));

    const now = new Date().toISOString();
    legacy.leads = [
      {
        id: 'lead-1',
        name: 'Лид',
        source: 'Telegram',
        stage: 'Очередь',
        createdAt: now,
        updatedAt: now,
        group: '7-14',
      },
    ];
    legacy.leadsArchive = [
      {
        id: 'lead-archived',
        name: 'Архив',
        source: 'Telegram',
        stage: 'Очередь',
        createdAt: now,
        updatedAt: now,
        group: '6-9',
      },
    ];
    legacy.leadHistory = [
      {
        id: 'history-1',
        leadId: 'lead-archived',
        name: 'Звонок',
        source: 'Telegram',
        createdAt: now,
        resolvedAt: now,
        outcome: 'converted',
        group: '11 и старше',
      },
    ];

    const legacyTaskId = legacy.tasks[0]?.id;
    if (legacy.tasks.length > 0) {
      legacy.tasks[0].group = '9-14';
    }
    legacy.tasksArchive = [
      {
        id: 'task-archived',
        title: 'Архивная задача',
        due: now,
        status: 'open',
        group: '6-9',
      },
    ];

    localStorage.setItem(LS_KEYS.db, JSON.stringify(legacy));

    const { result } = renderHook(() => useAppState());
    await act(async () => {});

    expect(result.current.db.settings.groups).toEqual([
      '4–6 лет',
      '7–10 лет',
      '11 лет и старше',
      'взрослые',
      'индивидуальные',
      'доп. группа',
    ]);
    expect(result.current.db.clients[0].group).toBe('7–10 лет');
    expect(result.current.db.schedule[0].group).toBe('11 лет и старше');
    expect(result.current.db.staff[0].groups).toEqual(['4–6 лет', '7–10 лет', '11 лет и старше']);
    expect(result.current.db.leads[0].group).toBe('11 лет и старше');
    expect(result.current.db.leadsArchive[0].group).toBe('7–10 лет');
    expect(result.current.db.leadHistory[0].group).toBe('11 лет и старше');
    if (legacyTaskId) {
      const legacyTask = result.current.db.tasks.find(task => task.id === legacyTaskId);
      expect(legacyTask?.group).toBe('11 лет и старше');
    }
    expect(result.current.db.tasksArchive[0].group).toBe('7–10 лет');

    for (const area of result.current.db.settings.areas) {
      expect(result.current.db.settings.limits[`${area}|7–10 лет`]).toBe(15);
      expect(result.current.db.settings.limits[`${area}|11 лет и старше`]).toBe(15);
    }
  });

  it('reloads data and shows a warning toast on DB conflict', async () => {
    const { result } = renderHook(() => useAppState());

    await act(async () => {});

    const updated = {
      ...result.current.db,
      revision: result.current.db.revision + 1,
      changelog: [
        ...result.current.db.changelog,
        { id: 'conflict-entry', who: 'Тест', what: 'Конфликт ревизии', when: new Date().toISOString() },
      ],
    };

    localStorage.setItem(LS_KEYS.db, JSON.stringify(updated));
    mockPush.mockClear();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(DB_CONFLICT_EVENT));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.db).toEqual(updated);
    });

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('Обновляем локальную копию'), 'warning');
  });

  it('creates payment tasks for clients whose pay date is today and lack open tasks', async () => {
    jest.useFakeTimers().setSystemTime(new Date(FIXED_TODAY));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const template = seedModule.makeSeedDB();
    const base = {
      revision: template.revision,
      clients: [] as any[],
      attendance: [] as any[],
      performance: [] as any[],
      schedule: [] as any[],
      leads: [] as any[],
      leadsArchive: [] as any[],
      leadHistory: [] as any[],
      tasks: [
        {
          id: 'existing-task',
          title: 'Оплата клиента — Existing',
          due: FIXED_TODAY,
          status: 'open',
          topic: 'оплата',
          assigneeType: 'client',
          assigneeId: 'client-with-task',
        },
      ],
      tasksArchive: [] as any[],
      staff: [] as any[],
      settings: template.settings,
      changelog: [] as any[],
    };

    const shared = {
      channel: 'Telegram',
      birthDate: '2015-01-01T00:00:00.000Z',
      gender: 'м',
      area: template.settings.areas[0],
      group: template.settings.groups[0],
      startDate: FIXED_TODAY,
      payMethod: 'перевод',
      payStatus: 'ожидание',
      status: 'действующий',
      subscriptionPlan: 'monthly',
    };

    base.clients = [
      { ...shared, id: 'client-a', firstName: 'Анна', parentName: 'Мария', payDate: FIXED_TODAY, payAmount: 100 },
      { ...shared, id: 'client-b', firstName: 'Борис', payDate: FIXED_TODAY, payAmount: 120 },
      { ...shared, id: 'client-with-task', firstName: 'Виктор', payDate: FIXED_TODAY, payAmount: 55 },
      {
        ...shared,
        id: 'client-active',
        firstName: 'Дмитрий',
        payDate: FIXED_TODAY,
        payAmount: 80,
        payActual: 75,
        payStatus: 'действует',
      },
      { ...shared, id: 'client-other', firstName: 'Глеб', payDate: '2024-05-09T00:00:00.000Z' },
    ];

    localStorage.setItem(LS_KEYS.db, JSON.stringify(base));
    const seedSpy = jest.spyOn(seedModule, 'makeSeedDB').mockReturnValue(
      JSON.parse(JSON.stringify(base)),
    );

    try {
      const { result } = renderHook(() => useAppState());

      await act(async () => {
        await Promise.resolve();
      });

      await waitFor(() => {
        const openPaymentTasks = result.current.db.tasks.filter(
          task => task.status === 'open' && task.topic === 'оплата' && task.assigneeType === 'client',
        );

        expect(openPaymentTasks.filter(task => task.assigneeId === 'client-a')).toHaveLength(1);
        expect(openPaymentTasks.filter(task => task.assigneeId === 'client-b')).toHaveLength(1);
        expect(openPaymentTasks.filter(task => task.assigneeId === 'client-with-task')).toHaveLength(1);
        expect(openPaymentTasks.filter(task => task.assigneeId === 'client-active')).toHaveLength(1);
        expect(openPaymentTasks.filter(task => task.assigneeId === 'client-other')).toHaveLength(0);
      });

      const stored = localStorage.getItem(LS_KEYS.db);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored as string);
      const persistedPaymentTasks = parsed.tasks.filter(
        (task: TaskItem) => task.status === 'open' && task.topic === 'оплата' && task.assigneeType === 'client',
      );

      expect(persistedPaymentTasks.filter((task: TaskItem) => task.assigneeId === 'client-a')).toHaveLength(1);
      expect(persistedPaymentTasks.filter((task: TaskItem) => task.assigneeId === 'client-b')).toHaveLength(1);
      expect(persistedPaymentTasks.filter((task: TaskItem) => task.assigneeId === 'client-with-task')).toHaveLength(1);
      expect(persistedPaymentTasks.filter((task: TaskItem) => task.assigneeId === 'client-active')).toHaveLength(1);

      const activeClient = result.current.db.clients.find(client => client.id === 'client-active');
      expect(activeClient?.payActual).toBe(75);
      expect(persistedPaymentTasks.filter((task: TaskItem) => task.assigneeId === 'client-other')).toHaveLength(0);
    } finally {
      seedSpy.mockRestore();
      warnSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
