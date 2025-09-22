// @ts-nocheck
import React from 'react';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('../../state/appState', () => ({
  __esModule: true,
  commitDBUpdate: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../state/utils', () => ({
  __esModule: true,
  uid: () => 'id-1',
  todayISO: () => new Date().toISOString(),
  parseDateInput: (s: string) => s,
  fmtMoney: (v: number) => String(v),
  calcAgeYears: () => 0,
  calcExperience: () => 0,
}));

jest.mock('../VirtualizedTable', () => (props) => <table>{props.children}</table>);

import ScheduleTab from '../ScheduleTab';
import { commitDBUpdate } from '../../state/appState';

beforeEach(() => {
  commitDBUpdate.mockImplementation(async (next, setDB) => {
    setDB(next);
    return true;
  });
  window.alert = jest.fn();
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  commitDBUpdate.mockResolvedValue(true);
});

function makeDb() {
  return {
    clients: [],
    attendance: [],
    schedule: [],
  leads: [],
  tasks: [],
  tasksArchive: [],
    staff: [],
    settings: {
      areas: ['A1'],
      groups: ['G1'],
      limits: {},
      rentByAreaEUR: {},
      currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
      coachPayFormula: '',
    },
    changelog: [],
  };
}

function renderSchedule(db = makeDb()) {
  let current = db;
  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    const setDB = (next) => { current = next; setState(next); };
    return <ScheduleTab db={state} setDB={setDB} />;
  };
  const utils = render(<Wrapper />);
  return { ...utils, getDb: () => current };
}

describe('ScheduleTab CRUD for areas and slots', () => {
  test('Create: add area and slot', async () => {
    const { getDb } = renderSchedule();
    const promptSpy = jest.spyOn(window, 'prompt');
    promptSpy.mockReturnValueOnce('A2');
    await userEvent.click(screen.getByText('+ район'));
    expect(getDb().settings.areas).toContain('A2');

    const promptsSlot = ['1', '10:00', 'G1'];
    promptSpy.mockImplementation(() => promptsSlot.shift());
    await userEvent.click(screen.getAllByText('+ группа')[1]);
    expect(getDb().schedule).toHaveLength(1);
    expect(getDb().schedule[0].area).toBe('A2');
  });

  test('Update: rename area and edit slot', async () => {
    const db = makeDb();
    db.schedule = [{ id: 's1', area: 'A1', weekday: 1, time: '10:00', group: 'G1', coachId: '', location: '' }];
    const { getDb } = renderSchedule(db);

    const promptSpy = jest.spyOn(window, 'prompt');
    promptSpy.mockReturnValueOnce('B1');
    const renameBtn = screen.getAllByText('✎')[0];
    await userEvent.click(renameBtn);
    expect(getDb().settings.areas[0]).toBe('B1');
    expect(getDb().schedule[0].area).toBe('B1');

    const prompts = ['2', '11:00', 'G1'];
    promptSpy.mockImplementation(() => prompts.shift());
    const editBtn = screen.getAllByText('✎')[1];
    await userEvent.click(editBtn);
    expect(getDb().schedule[0].weekday).toBe(2);
    expect(getDb().schedule[0].time).toBe('11:00');
  });

  test('Delete: delete slot and area', async () => {
    const db = makeDb();
    db.schedule = [{ id: 's1', area: 'A1', weekday: 1, time: '10:00', group: 'G1', coachId: '', location: '' }];
    const { getDb } = renderSchedule(db);

    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const slotItem = screen.getByText(/10:00/).closest('li');
    const delSlotBtn = within(slotItem).getByText('✕');
    await userEvent.click(delSlotBtn);
    expect(getDb().schedule).toHaveLength(0);

    const delAreaBtn = screen.getAllByText('✕')[0];
    await userEvent.click(delAreaBtn);
    expect(getDb().settings.areas).toHaveLength(0);
  });
});

