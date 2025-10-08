// @ts-nocheck
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('react-window', () => {
  const React = require('react');
  return {
    FixedSizeList: ({ itemCount, children, outerElementType: Outer = 'div', innerElementType: Inner = 'div' }) => {
      const items = Array.from({ length: itemCount }).map((_, i) => children({ index: i, style: {} }));
      return React.createElement(
        Outer,
        { style: {} },
        React.createElement(Inner, { style: {} }, items),
      );
    },
  };
}, { virtual: true });

jest.mock('../../state/appState', () => ({
  __esModule: true,
  commitDBUpdate: jest.fn(),
}));

jest.mock('../../state/utils', () => ({
  __esModule: true,
  uid: jest.fn(),
  todayISO: jest.fn(),
  parseDateInput: jest.fn(),
  fmtMoney: jest.fn(),
  fmtDate: jest.fn(),
  calcAgeYears: jest.fn(),
  calcExperience: jest.fn(),
  isReserveArea: jest.fn(() => false),
  ensureReserveAreaIncluded: jest.fn(v => v),
  RESERVE_AREA_NAME: 'резерв',

}));

jest.mock('../../state/reserve', () => ({
  __esModule: true,
  isReserveArea: jest.fn(() => false),
  ensureReserveAreaIncluded: jest.fn(v => v),
  RESERVE_AREA_NAME: 'резерв',
}));

import GroupsTab from '../GroupsTab';
import { commitDBUpdate } from '../../state/appState';
import {
  uid,
  todayISO,
  parseDateInput,
  fmtMoney,
  fmtDate,
  calcAgeYears,
  calcExperience,
} from '../../state/utils';
import { isReserveArea } from '../../state/reserve';

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  commitDBUpdate.mockImplementation(async (next, setDB) => {
    setDB(next);
    return { ok: true, db: next };
  });
  uid.mockReturnValue('uid-123');
  todayISO.mockReturnValue('2024-01-01T00:00:00.000Z');
  parseDateInput.mockImplementation((v) => (v ? v + 'T00:00:00.000Z' : ''));
  fmtMoney.mockImplementation((v, c) => v + ' ' + c);
  fmtDate.mockImplementation((iso) => iso);
  calcAgeYears.mockReturnValue(10);
  calcExperience.mockReturnValue('1 год');
  isReserveArea.mockImplementation(area => area?.trim().toLowerCase() === 'резерв');
  global.confirm = jest.fn(() => true);
  window.alert = jest.fn();
});

const makeDB = () => ({
  revision: 0,
  clients: [],
  attendance: [],
  performance: [],
  schedule: [
    { id: 'slot-1', area: 'Area1', group: 'Group1', coachId: 's1', weekday: 1, time: '10:00', location: '' },
    { id: 'slot-2', area: 'Area1', group: 'Group2', coachId: 's1', weekday: 2, time: '11:00', location: '' },
    { id: 'slot-3', area: 'Area2', group: 'Group1', coachId: 's1', weekday: 3, time: '12:00', location: '' },
  ],
  leads: [],
  leadsArchive: [],
  leadHistory: [],
  tasks: [],
  tasksArchive: [],
  staff: [{ id: 's1', role: 'Тренер', name: 'Coach1' }],
  settings: {
    areas: ['Area1', 'Area2'],
    groups: ['Group1', 'Group2'],
    limits: {},
    rentByAreaEUR: {},
    coachSalaryByAreaEUR: {},
    currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
    coachPayFormula: '',
  },
  changelog: [],
});

const makeUI = () => ({
  role: 'Администратор',
  activeTab: 'groups',
  breadcrumbs: [],
  currency: 'EUR',
  search: '',
  theme: 'light',
  pendingClientId: null,
});

const renderGroups = (db = makeDB(), ui = makeUI(), initialFilters = {}) => {
  let current = db;
  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    const [uiState] = React.useState(ui);
    const setDB = (next) => { current = next; setState(next); };
    return <GroupsTab db={state} setDB={setDB} ui={uiState} {...initialFilters} />;
  };
  const utils = render(<Wrapper />);
  return { ...utils, getDB: () => current };
};

const makeClient = (overrides = {}) => ({
  id: 'client-id',
  firstName: 'Имя',
  lastName: '',
  phone: '',
  whatsApp: '',
  telegram: '',
  instagram: '',
  channel: 'Telegram',
  birthDate: '2010-01-01T00:00:00.000Z',
  parentName: '',
  gender: 'м',
  area: 'Area1',
  group: 'Group1',
  startDate: '2024-01-01T00:00:00.000Z',
  payMethod: 'перевод',
  payStatus: 'ожидание',
  status: 'действующий',
  subscriptionPlan: 'monthly',
  payDate: '2024-01-10T00:00:00.000Z',
  payAmount: 55,
  remainingLessons: 5,
  ...overrides,
});

test('create: adds client through modal', async () => {
  const { getDB, unmount } = renderGroups();

  expect(screen.getByText('Выберите район и группу')).toBeInTheDocument();
  await userEvent.click(screen.getByText('+ Добавить клиента'));
  const modal = screen.getByText('Новый клиент').parentElement;

  const firstName = within(modal).getByText('Имя').parentElement.querySelector('input');
  const phone = within(modal).getByText('Телефон').parentElement.querySelector('input');
  const birthDate = within(modal).getByText('Дата рождения').parentElement.querySelector('input');
  const startDate = within(modal).getByText('Дата начала').parentElement.querySelector('input');

  await userEvent.type(firstName, 'Вася');
  await userEvent.type(phone, '12345');
  fireEvent.change(birthDate, { target: { value: '2010-01-01' } });
  fireEvent.change(startDate, { target: { value: '2024-01-01' } });

  const saveBtn = within(modal).getByText('Сохранить');
  await waitFor(() => expect(saveBtn).toBeEnabled());
  await userEvent.click(saveBtn);

  await waitFor(() => expect(getDB().clients).toHaveLength(1));
  unmount();
  renderGroups(getDB(), makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
  await waitFor(() => expect(screen.getByText(/^Вася/)).toBeInTheDocument());
  expect(getDB().clients).toHaveLength(1);
  expect(getDB().clients[0].payAmount).toBe(55);
});

test('read: filters clients by area, group and pay status', () => {
  const db = makeDB();
  db.clients = [
    makeClient({ id: 'c1', firstName: 'A', area: 'Area1', group: 'Group1', payStatus: 'ожидание' }),
    makeClient({ id: 'c2', firstName: 'B', area: 'Area2', group: 'Group1', payStatus: 'действует' }),
    makeClient({ id: 'c3', firstName: 'C', area: 'Area1', group: 'Group2', payStatus: 'задолженность' }),
  ];

  const view1 = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.queryByText('B')).not.toBeInTheDocument();
  expect(screen.queryByText('C')).not.toBeInTheDocument();
  view1.unmount();

  const view2 = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group2' });
  expect(screen.getByText('C')).toBeInTheDocument();
  expect(screen.queryByText('A')).not.toBeInTheDocument();
  expect(screen.queryByText('B')).not.toBeInTheDocument();
  view2.unmount();

  renderGroups(db, makeUI(), { initialArea: 'Area2', initialGroup: 'Group1', initialPay: 'действует' });
  expect(screen.getByText('B')).toBeInTheDocument();
  expect(screen.queryByText('A')).not.toBeInTheDocument();
  expect(screen.queryByText('C')).not.toBeInTheDocument();
});

test('filters clients by selected month', async () => {
  const db = makeDB();
  db.clients = [
    makeClient({ id: 'jan', firstName: 'Январь', startDate: '2024-01-01T00:00:00.000Z', payDate: '2024-01-05T00:00:00.000Z' }),
    makeClient({ id: 'feb', firstName: 'Февраль', startDate: '2024-02-01T00:00:00.000Z', payDate: '2024-02-05T00:00:00.000Z' }),
    makeClient({ id: 'mar', firstName: 'Март', startDate: '2024-03-01T00:00:00.000Z', payDate: '2024-03-05T00:00:00.000Z' }),
  ];

  renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });

  const monthInput = screen.getByLabelText('Фильтр по месяцу');
  fireEvent.change(monthInput, { target: { value: '1' } });

  await waitFor(() => {
    expect(screen.getByRole('row', { name: /Январь/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Февраль/ })).not.toBeInTheDocument();
  });

  fireEvent.change(monthInput, { target: { value: '2' } });

  await waitFor(() => {
    expect(screen.getByRole('row', { name: /Февраль/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Январь/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Март/ })).not.toBeInTheDocument();
  });
});

test('hides clients assigned to reserve area', () => {
  const db = makeDB();
  db.settings.areas = [...db.settings.areas, 'резерв'];
  db.settings.groups = [...db.settings.groups, 'ReserveGroup'];
  db.schedule.push({ id: 'slot-res', area: 'резерв', group: 'ReserveGroup', coachId: 's1', weekday: 4, time: '15:00', location: '' });
  db.clients = [
    makeClient({ id: 'regular', firstName: 'Обычный', area: 'Area1', group: 'Group1' }),
    makeClient({ id: 'reserve', firstName: 'Резерв', area: 'резерв', group: 'ReserveGroup' }),
  ];

  renderGroups(db, makeUI(), { initialArea: 'резерв', initialGroup: 'ReserveGroup' });

  expect(screen.queryByText('Резерв')).not.toBeInTheDocument();
  expect(screen.getByText('Найдено: 0')).toBeInTheDocument();
});

test('update: edits client name', async () => {
  const db = makeDB();
  db.clients = [
    makeClient({ id: 'c1', firstName: 'Old', phone: '123' }),
  ];
  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
  await waitFor(() => expect(screen.getByText(/^Old/)).toBeInTheDocument());
  await userEvent.click(screen.getByText(/^Old/));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
  const modal = screen.getByText('Редактирование клиента').parentElement;
  const input = within(modal).getByText('Имя').parentElement.querySelector('input');
  const phone = within(modal).getByText('Телефон').parentElement.querySelector('input');
  const birthDate = within(modal).getByText('Дата рождения').parentElement.querySelector('input');
  const startDate = within(modal).getByText('Дата начала').parentElement.querySelector('input');
  await userEvent.clear(input);
  await userEvent.type(input, 'New');
  await userEvent.type(phone, '4');
  fireEvent.change(birthDate, { target: { value: '2010-01-01' } });
  fireEvent.change(startDate, { target: { value: '2024-01-01' } });

  const save = within(modal).getByRole('button', { name: 'Сохранить' });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);

  await waitFor(() => expect(getDB().clients.find(c => c.id === 'c1').firstName).toBe('New'));
  await waitFor(() => expect(screen.getByText(/^New/)).toBeInTheDocument());
});

test('update: moving client between groups clears manual-only fields', async () => {
  const db = makeDB();
  db.settings.groups.push('индивидуальные');
  db.schedule.push({ id: 'slot-ind', area: 'Area1', group: 'индивидуальные', coachId: 's1', weekday: 4, time: '13:00', location: '' });
  db.clients = [
    makeClient({
      id: 'c-manual',
      firstName: 'Manual',
      group: 'индивидуальные',
      phone: '123',
      remainingLessons: 7,
      payAmount: 200,
    }),
  ];

  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'индивидуальные' });

  await waitFor(() => expect(screen.getByText(/^Manual/)).toBeInTheDocument());
  await userEvent.click(screen.getByText(/^Manual/));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

  const modal = screen.getByText('Редактирование клиента').parentElement;
  const groupSelect = within(modal).getByText('Группа').parentElement.querySelector('select');
  await userEvent.selectOptions(groupSelect, 'Group1');

  const save = within(modal).getByRole('button', { name: 'Сохранить' });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);

  await waitFor(() => {
    const updated = getDB().clients.find(c => c.id === 'c-manual');
    return updated?.group === 'Group1';
  });

  const updated = getDB().clients.find(c => c.id === 'c-manual');
  expect(updated?.remainingLessons).toBeUndefined();
  expect(updated?.payAmount).toBe(55);
});

test('delete: removes client after confirmation', async () => {
  const db = makeDB();
  db.clients = [makeClient({ id: 'c1', firstName: 'Del' })];
  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
  await waitFor(() => expect(screen.getByText('Del')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Удалить'));

  expect(global.confirm).toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByText('Del')).not.toBeInTheDocument());
  expect(getDB().clients.find(c => c.id === 'c1')).toBeUndefined();
});

test('creates payment task with client info', async () => {
  uid.mockReset();
  uid
    .mockReturnValueOnce('task-1')
    .mockReturnValueOnce('log-1');

  const db = makeDB();
  db.clients = [
    makeClient({
      id: 'c1',
      firstName: 'Ivan',
      lastName: 'Petrov',
      parentName: 'Parent',
      payStatus: 'действует',
      payAmount: 50,
      payDate: '2024-02-01T00:00:00.000Z',
    }),
  ];

  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
  fireEvent.change(screen.getByLabelText('Фильтр по месяцу'), { target: { value: '2' } });
  const row = await screen.findByText('Ivan Petrov');
  const createTaskBtn = within(row.closest('tr')).getByRole('button', { name: 'Создать задачу' });

  await userEvent.click(createTaskBtn);

  await waitFor(() => expect(getDB().tasks).toHaveLength(1));
  expect(getDB().tasks[0]).toEqual({
    id: 'task-1',
    title: 'Оплата клиента — Ivan Petrov • родитель: Parent • сумма: 50 EUR • дата: 2024-02-01',
    due: '2024-02-01T00:00:00.000Z',
    status: 'open',
    topic: 'оплата',
    assigneeType: 'client',
    assigneeId: 'c1',
  });
  expect(getDB().clients[0].payStatus).toBe('задолженность');
});

test('completes payment task and updates client payment data', async () => {
  const db = makeDB();
  db.clients = [
    makeClient({
      id: 'c1',
      firstName: 'Должник',
      payStatus: 'задолженность',
      payAmount: 55,
      payActual: undefined,
    }),
  ];
  db.tasks = [
    {
      id: 'task-1',
      title: 'Оплата клиента — Должник',
      due: '2024-02-01T00:00:00.000Z',
      status: 'open',
      topic: 'оплата',
      assigneeType: 'client',
      assigneeId: 'c1',
    },
  ];

  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });

  const row = await screen.findByText('Должник');
  const tableRow = row.closest('tr');
  expect(tableRow).not.toBeNull();
  const payButton = await within(tableRow!).findByRole('button', { name: 'Оплатил' });

  await userEvent.click(payButton);

  await waitFor(() => {
    expect(getDB().tasks).toHaveLength(0);
    expect(getDB().tasksArchive).toHaveLength(1);
    expect(getDB().clients[0].payStatus).toBe('действует');
    expect(getDB().clients[0].payActual).toBe(55);
  });

  await waitFor(() => expect(within(tableRow!).queryByRole('button', { name: 'Оплатил' })).not.toBeInTheDocument());
  expect(within(tableRow!).getByText('действует')).toBeInTheDocument();
});

test('half-month subscription advances payDate by 14 days on payment completion', async () => {
  const db = makeDB();
  db.clients = [
    makeClient({
      id: 'half',
      firstName: 'Пол',
      payStatus: 'задолженность',
      subscriptionPlan: 'half-month',
      payDate: '2024-02-01T00:00:00.000Z',
      payAmount: 27.5,
    }),
  ];
  db.tasks = [
    {
      id: 'task-half',
      title: 'Оплата клиента — Пол',
      due: '2024-02-01T00:00:00.000Z',
      status: 'open',
      topic: 'оплата',
      assigneeType: 'client',
      assigneeId: 'half',
    },
  ];

  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });

  const monthInput = screen.getByLabelText('Фильтр по месяцу');
  fireEvent.change(monthInput, { target: { value: '2' } });

  const row = await screen.findByText('Пол');
  const tableRow = row.closest('tr');
  expect(tableRow).not.toBeNull();
  const payButton = await within(tableRow!).findByRole('button', { name: 'Оплатил' });

  await userEvent.click(payButton);

  await waitFor(() => {
    expect(getDB().tasks).toHaveLength(0);
    expect(getDB().tasksArchive).toHaveLength(1);
    expect(getDB().clients[0].payStatus).toBe('действует');
    expect(getDB().clients[0].payDate).toBe('2024-02-15T00:00:00.000Z');
  });
});

test('individual group allows custom payment amount', async () => {
  const db = makeDB();
  db.settings.groups = ['Group1', 'индивидуальные'];
  db.schedule.push({ id: 'slot-ind', area: 'Area1', group: 'индивидуальные', coachId: 's1', weekday: 4, time: '13:00', location: '' });
  const { getDB } = renderGroups(db);

  await userEvent.click(screen.getByText('+ Добавить клиента'));
  const modal = screen.getByText('Новый клиент').parentElement;

  const groupSelect = within(modal).getByText('Группа').parentElement.querySelector('select');
  await userEvent.selectOptions(groupSelect, 'индивидуальные');

  const firstName = within(modal).getByText('Имя').parentElement.querySelector('input');
  const phone = within(modal).getByText('Телефон').parentElement.querySelector('input');
  const birthDate = within(modal).getByText('Дата рождения').parentElement.querySelector('input');
  const startDate = within(modal).getByText('Дата начала').parentElement.querySelector('input');
  const payAmount = within(modal).getByText('Сумма оплаты, €').parentElement.querySelector('input');

  await userEvent.type(firstName, 'Люба');
  await userEvent.type(phone, '999');
  fireEvent.change(birthDate, { target: { value: '2010-01-01' } });
  fireEvent.change(startDate, { target: { value: '2024-01-01' } });

  await waitFor(() => expect(payAmount).toHaveValue(125));
  await userEvent.clear(payAmount);
  await userEvent.type(payAmount, '200');

  const saveBtn = within(modal).getByText('Сохранить');
  await waitFor(() => expect(saveBtn).toBeEnabled());
  await userEvent.click(saveBtn);

  await waitFor(() => expect(getDB().clients[0].group).toBe('индивидуальные'));
  expect(getDB().clients[0].payAmount).toBe(200);
});
