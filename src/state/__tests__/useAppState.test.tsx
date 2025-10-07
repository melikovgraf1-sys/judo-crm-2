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
      expect(persistedPaymentTasks.filter((task: TaskItem) => task.assigneeId === 'client-other')).toHaveLength(0);
    } finally {
      seedSpy.mockRestore();
      warnSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
