// @ts-nocheck
import '@testing-library/jest-dom';
import { act, renderHook } from '@testing-library/react';

const mockPush = jest.fn();

jest.mock(
  'react-router-dom',
  () => ({
    __esModule: true,
    useLocation: () => ({ pathname: '/' }),
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

import { commitDBUpdate, LS_KEYS, LOCAL_ONLY_MESSAGE, useAppState } from '../appState';

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

    let persisted = false;
    await act(async () => {
      persisted = await commitDBUpdate(next, result.current.setDB);
    });

    expect(persisted).toBe(true);
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
});
