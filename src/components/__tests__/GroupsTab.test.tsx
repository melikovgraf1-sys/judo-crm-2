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
    analyticsFavorites: [],
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

const makeClient = (overrides = {}) => {
  const base = {
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
    payActual: 55,
    remainingLessons: 5,
    ...overrides,
  };

  if (overrides.placements) {
    return base;
  }

  return {
    ...base,
    placements: [
      {
        id: `pl-${base.id}`,
        area: base.area,
        group: base.group,
        payStatus: base.payStatus,
        status: base.status,
        subscriptionPlan: base.subscriptionPlan,
        payDate: base.payDate,
        payAmount: base.payAmount,
        payActual: base.payActual,
        remainingLessons: base.remainingLessons,
      },
    ],
  };
};

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

test('read: skips placements with status отмена', () => {
  const db = makeDB();
  db.clients = [
    makeClient({ id: 'active', firstName: 'Активный', area: 'Area1', group: 'Group1' }),
    makeClient({
      id: 'cancel-placement',
      firstName: 'Отмененный',
      area: 'Area1',
      group: 'Group1',
      placements: [
        {
          id: 'pl-cancel',
          area: 'Area1',
          group: 'Group1',
          payStatus: 'ожидание',
          status: 'отмена',
          subscriptionPlan: 'monthly',
          payDate: '2024-01-10T00:00:00.000Z',
          payAmount: 55,
          payActual: 55,
          remainingLessons: 5,
          frozenLessons: 0,
        },
      ],
    }),
  ];

  renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });

  expect(screen.getByText('Активный')).toBeInTheDocument();
  expect(screen.queryByText('Отмененный')).not.toBeInTheDocument();
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

test('shows paid status for the active placement even if other placements owe', async () => {
  const db = makeDB();
  const client = makeClient({
    id: 'multi',
    firstName: 'Мульти',
    payStatus: 'задолженность',
    area: 'Area1',
    group: 'Group1',
  });

  client.payAmount = 55;
  client.payActual = 55;
  client.payHistory = [
    { id: 'fact-1', area: 'Area1', group: 'Group1', paidAt: '2024-01-10T00:00:00.000Z' },
  ];
  client.placements = [
    {
      id: 'pl-1',
      area: 'Area1',
      group: 'Group1',
      payStatus: 'действует',
      status: 'действующий',
      subscriptionPlan: 'monthly',
      payDate: '2024-01-05T00:00:00.000Z',
      payAmount: 55,
      payActual: 55,
      remainingLessons: 5,
    },
    {
      id: 'pl-2',
      area: 'Area1',
      group: 'Group2',
      payStatus: 'задолженность',
      status: 'действующий',
      subscriptionPlan: 'monthly',
      payDate: '2024-01-05T00:00:00.000Z',
      payAmount: 55,
      payActual: 0,
      remainingLessons: 5,
    },
  ];

  db.clients = [client];

  renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });

  const nameCell = await screen.findByText('Мульти');
  const row = nameCell.closest('tr');
  expect(row).not.toBeNull();
  expect(within(row).getByText('действует')).toBeInTheDocument();
  expect(db.clients[0].placements.find(place => place.group === 'Group2')?.payStatus).toBe('задолженность');
});

test('clients with multiple placements appear in each matching group', async () => {
  const db = makeDB();
  const client = makeClient({
    id: 'multi-group',
    firstName: 'МультиГруппа',
    area: 'Area1',
    group: 'Group1',
  });

  client.placements = [
    {
      id: 'pl-1',
      area: 'Area1',
      group: 'Group1',
      payStatus: 'действует',
      status: 'действующий',
      subscriptionPlan: 'monthly',
      payDate: '2024-01-05T00:00:00.000Z',
      payAmount: 55,
      payActual: 55,
      remainingLessons: 5,
    },
    {
      id: 'pl-2',
      area: 'Area1',
      group: 'Group2',
      payStatus: 'действует',
      status: 'действующий',
      subscriptionPlan: 'monthly',
      payDate: '2024-01-05T00:00:00.000Z',
      payAmount: 55,
      payActual: 55,
      remainingLessons: 5,
    },
  ];

  db.clients = [client];

  renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });

  await waitFor(() => expect(screen.getByText('МультиГруппа')).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText('Фильтр по группе'), { target: { value: 'Group2' } });

  await waitFor(() => expect(screen.getByText('МультиГруппа')).toBeInTheDocument());
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

test('update: editing payment status hides payment fact fields', async () => {
  const db = makeDB();
  db.clients = [
    makeClient({
      id: 'c-pay',
      firstName: 'Оплатил',
      payStatus: 'ожидание',
      payActual: undefined,
      payAmount: 60,
      payDate: '2024-01-05T00:00:00.000Z',
      payHistory: [
        {
          id: 'fact-c-pay',
          paidAt: '2024-01-05T00:00:00.000Z',
          amount: 55,
          area: 'Area1',
          group: 'Group1',
          subscriptionPlan: 'monthly',
        },
      ],
      phone: '12345',
    }),
  ];

  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });

  const row = await screen.findByText('Оплатил');
  const tableRow = row.closest('tr');
  expect(tableRow).not.toBeNull();

  await userEvent.click(row);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Редактировать' }));

  const modal = screen.getByText('Редактирование клиента').parentElement;
  const planSelect = within(modal).getByText('Форма абонемента').parentElement.querySelector('select') as HTMLSelectElement;
  const payDateInput = within(modal).getByText('Дата оплаты').parentElement.querySelector('input') as HTMLInputElement;
  const factInput = within(modal).getByText('Факт оплаты, €').parentElement.querySelector('input') as HTMLInputElement;
  const payAmountInput = within(modal).getByText('Сумма оплаты, €').parentElement.querySelector('input') as HTMLInputElement;

  expect(planSelect).toBeDisabled();
  expect(payDateInput).toBeDisabled();
  expect(factInput).toBeDisabled();
  expect(payAmountInput).toBeDisabled();
  expect(within(modal).getByText(/Укажите статус оплаты «действует»/)).toBeInTheDocument();

  const payStatusSelect = within(modal).getByText('Статус оплаты').parentElement.querySelector('select') as HTMLSelectElement;

  await userEvent.selectOptions(payStatusSelect, 'действует');
  await waitFor(() => expect(within(modal).queryByText(/Укажите статус оплаты «действует»/)).not.toBeInTheDocument());
  await waitFor(() => {
    const select = within(modal).getByText('Форма абонемента').parentElement.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeDisabled();
  });
  await waitFor(() => {
    const dateInput = within(modal).getByText('Дата оплаты').parentElement.querySelector('input') as HTMLInputElement;
    expect(dateInput).not.toBeDisabled();
  });
  await waitFor(() => {
    const factField = within(modal).getByText('Факт оплаты, €').parentElement.querySelector('input') as HTMLInputElement;
    expect(factField).not.toBeDisabled();
  });

  const save = within(modal).getByRole('button', { name: 'Сохранить' });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);

  await waitFor(() => expect(getDB().clients[0].payStatus).toBe('действует'));
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

test('delete: removes payment task after confirmation', async () => {
  const task = {
    id: 'task-1',
    title: 'Оплата',
    due: '2024-02-01T00:00:00.000Z',
    status: 'open',
    assigneeType: 'client',
    assigneeId: 'c1',
    topic: 'оплата',
  };

  const db = makeDB();
  db.tasks = [task];
  db.clients = [makeClient({ id: 'c1', firstName: 'Del', payStatus: 'задолженность' })];

  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
  const row = await screen.findByText('Del');
  const deleteBtn = within(row.closest('tr')).getByRole('button', { name: 'Удалить задачу' });

  await userEvent.click(deleteBtn);

  expect(global.confirm).toHaveBeenCalled();
  await waitFor(() => expect(getDB().tasks).toHaveLength(0));
  expect(getDB().tasksArchive[0]).toMatchObject({ id: 'task-1' });
  await waitFor(() => expect(within(row.closest('tr')).queryByRole('button', { name: 'Удалить задачу' })).not.toBeInTheDocument());
});

test('reserve: moves client to reserve area', async () => {
  const db = makeDB();
  db.clients = [makeClient({ id: 'c1', firstName: 'Reserve' })];

  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
  const row = await screen.findByText('Reserve');
  const reserveBtn = within(row.closest('tr')).getByRole('button', { name: 'Резерв' });

  await userEvent.click(reserveBtn);

  expect(global.confirm).toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByText('Reserve')).not.toBeInTheDocument());
  const updated = getDB().clients.find(c => c.id === 'c1');
  expect(updated?.area).toBe('резерв');
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
    area: 'Area1',
    group: 'Group1',
    placementId: 'pl-c1',
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
    expect(getDB().clients[0].payDate).toBe('2024-02-10T00:00:00.000Z');
    const history = getDB().clients[0].payHistory;
    expect(history).toHaveLength(1);
    expect(history?.[0]?.paidAt).toBe('2024-01-01T00:00:00.000Z');
  });
  await waitFor(() => expect(screen.queryByText('Пол')).not.toBeInTheDocument());

  const januaryRow = await screen.findByText('Должник');
  const januaryTableRow = januaryRow.closest('tr');
  expect(januaryTableRow).not.toBeNull();
  await waitFor(() =>
    expect(within(januaryTableRow!).queryByRole('button', { name: 'Оплатил' })).not.toBeInTheDocument(),
  );

  const monthInput = screen.getByLabelText('Фильтр по месяцу');
  fireEvent.change(monthInput, { target: { value: '2' } });

  await waitFor(() => expect(screen.getByText('Должник')).toBeInTheDocument());
});

test('monthly subscription completed late keeps previous month visible', async () => {
  todayISO.mockReturnValue('2024-10-01T00:00:00.000Z');

  const db = makeDB();
  db.clients = [
    makeClient({
      id: 'late',
      firstName: 'Поздний',
      payStatus: 'задолженность',
      subscriptionPlan: 'monthly',
      payDate: '2024-09-05T00:00:00.000Z',
    }),
  ];
  db.tasks = [
    {
      id: 'task-late',
      title: 'Оплата клиента — Поздний',
      due: '2024-09-05T00:00:00.000Z',
      status: 'open',
      topic: 'оплата',
      assigneeType: 'client',
      assigneeId: 'late',
    },
  ];

  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });

  const monthInput = screen.getByLabelText('Фильтр по месяцу');
  fireEvent.change(monthInput, { target: { value: '9' } });

  const row = await screen.findByText('Поздний');
  const tableRow = row.closest('tr');
  expect(tableRow).not.toBeNull();
  const payButton = await within(tableRow!).findByRole('button', { name: 'Оплатил' });

  await userEvent.click(payButton);

  await waitFor(() => {
    expect(getDB().clients[0].payDate).toBe('2024-10-05T00:00:00.000Z');
    expect(
      getDB().clients[0].payHistory?.some(
        entry => entry && entry.paidAt === '2024-09-05T00:00:00.000Z',
      ),
    ).toBe(true);
  });

  await waitFor(() => expect(screen.getByText('Поздний')).toBeInTheDocument());

  fireEvent.change(monthInput, { target: { value: '10' } });
  await waitFor(() => expect(screen.getByText('Поздний')).toBeInTheDocument());

  fireEvent.change(monthInput, { target: { value: '9' } });
  await waitFor(() => expect(screen.getByText('Поздний')).toBeInTheDocument());
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
    const updated = getDB().clients[0];
    expect(updated.payStatus).toBe('действует');
    expect(updated.placements[0]?.payDate).toBe('2024-01-15T00:00:00.000Z');
  });
  await waitFor(() => expect(screen.queryByText('Пол')).not.toBeInTheDocument());

  fireEvent.change(monthInput, { target: { value: '1' } });
  const januaryRow = await screen.findByText('Пол');
  const januaryTableRow = januaryRow.closest('tr');
  expect(januaryTableRow).not.toBeNull();
  await waitFor(() =>
    expect(within(januaryTableRow!).queryByRole('button', { name: 'Оплатил' })).not.toBeInTheDocument(),
  );
});

test('weekly subscription advances payDate by one calendar month on payment completion', async () => {
  const db = makeDB();
  db.clients = [
    makeClient({
      id: 'weekly',
      firstName: 'Неделя',
      payStatus: 'задолженность',
      subscriptionPlan: 'weekly',
      payDate: '2024-02-01T00:00:00.000Z',
      payAmount: 27.5,
    }),
  ];
  db.tasks = [
    {
      id: 'task-weekly',
      title: 'Оплата клиента — Неделя',
      due: '2024-02-01T00:00:00.000Z',
      status: 'open',
      topic: 'оплата',
      assigneeType: 'client',
      assigneeId: 'weekly',
    },
  ];

  const { getDB } = renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });

  const monthInput = screen.getByLabelText('Фильтр по месяцу');
  fireEvent.change(monthInput, { target: { value: '2' } });

  const row = await screen.findByText('Неделя');
  const tableRow = row.closest('tr');
  expect(tableRow).not.toBeNull();
  const payButton = await within(tableRow!).findByRole('button', { name: 'Оплатил' });

  await userEvent.click(payButton);

  await waitFor(() => {
    const updated = getDB().clients[0];
    expect(updated.payStatus).toBe('действует');
    expect(updated.payDate).toBe('2024-03-01T00:00:00.000Z');
  });
});

test('standard group exposes all plans and default expected amount', async () => {
  const db = makeDB();
  renderGroups(db);

  await userEvent.click(screen.getByText('+ Добавить клиента'));
  const modal = screen.getByText('Новый клиент').parentElement;
  expect(modal).not.toBeNull();

  const planSelect = within(modal!).getByText('Форма абонемента').parentElement!.querySelector('select') as HTMLSelectElement;
  const planValues = Array.from(planSelect.options).map(option => option.value);
  expect(planValues).toEqual(['monthly', 'weekly', 'half-month', 'discount', 'single']);

  const payAmountInput = within(modal!)
    .getByText('Сумма оплаты, €')
    .parentElement!.querySelector('input') as HTMLInputElement;
  expect(payAmountInput.value).toBe('55');
});

test('adult group restricts plans and seeds expected amount', async () => {
  const db = makeDB();
  db.settings.groups = ['Group1', 'взрослые'];
  db.schedule.push({ id: 'slot-adult', area: 'Area1', group: 'взрослые', coachId: 's1', weekday: 5, time: '19:00', location: '' });
  renderGroups(db, makeUI(), { initialArea: 'Area1', initialGroup: 'взрослые' });

  await userEvent.click(screen.getByText('+ Добавить клиента'));
  const modal = screen.getByText('Новый клиент').parentElement;
  expect(modal).not.toBeNull();

  const groupSelect = within(modal!).getByText('Группа').parentElement!.querySelector('select');
  await userEvent.selectOptions(groupSelect as HTMLSelectElement, 'взрослые');

  const planSelect = within(modal!).getByText('Форма абонемента').parentElement!.querySelector('select') as HTMLSelectElement;
  await waitFor(() => expect(planSelect.value).toBe('monthly'));
  const planValues = Array.from(planSelect.options).map(option => option.value);
  expect(planValues).toEqual(['monthly', 'discount', 'single']);

  const payAmountInput = within(modal!)
    .getByText('Сумма оплаты, €')
    .parentElement!.querySelector('input') as HTMLInputElement;
  expect(payAmountInput.value).toBe('55');
});

test('focus group applies override and allowed plans', async () => {
  const db = makeDB();
  db.settings.areas = ['джикджилли'];
  db.settings.groups = ['фокус'];
  db.schedule = [
    { id: 'slot-focus', area: 'джикджилли', group: 'фокус', coachId: 's1', weekday: 2, time: '10:30', location: '' },
  ];
  renderGroups(db, makeUI(), { initialArea: 'джикджилли', initialGroup: 'фокус' });

  await userEvent.click(screen.getByText('+ Добавить клиента'));
  const modal = screen.getByText('Новый клиент').parentElement;
  expect(modal).not.toBeNull();

  const planSelect = within(modal!).getByText('Форма абонемента').parentElement!.querySelector('select') as HTMLSelectElement;
  const planValues = Array.from(planSelect.options).map(option => option.value);
  expect(planValues).toEqual(['weekly', 'single']);

  const payAmountInput = within(modal!)
    .getByText('Сумма оплаты, €')
    .parentElement!.querySelector('input') as HTMLInputElement;
  await waitFor(() => expect(payAmountInput.value).toBe('25'));
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

  const planSelect = within(modal).getByText('Форма абонемента').parentElement.querySelector('select') as HTMLSelectElement;
  const planValues = Array.from(planSelect.options).map(option => option.value);
  expect(planValues).toEqual(['monthly', 'single']);

  const payAmountInput = within(modal)
    .getByText('Сумма оплаты, €')
    .parentElement.querySelector('input') as HTMLInputElement;
  expect(payAmountInput.value).toBe('130');

  const firstName = within(modal).getByText('Имя').parentElement.querySelector('input');
  const phone = within(modal).getByText('Телефон').parentElement.querySelector('input');
  const birthDate = within(modal).getByText('Дата рождения').parentElement.querySelector('input');
  const startDate = within(modal).getByText('Дата начала').parentElement.querySelector('input');
  expect(
    within(modal).getByText('Форма абонемента').parentElement.querySelector('select') as HTMLSelectElement,
  ).toBeDisabled();
  expect(
    within(modal).getByText('Сумма оплаты, €').parentElement.querySelector('input') as HTMLInputElement,
  ).toBeDisabled();
  expect(
    within(modal).getByText('Факт оплаты, €').parentElement.querySelector('input') as HTMLInputElement,
  ).toBeDisabled();
  expect(
    within(modal).getByText('Дата оплаты').parentElement.querySelector('input') as HTMLInputElement,
  ).toBeDisabled();

  await userEvent.type(firstName, 'Люба');
  await userEvent.type(phone, '999');
  fireEvent.change(birthDate, { target: { value: '2010-01-01' } });
  fireEvent.change(startDate, { target: { value: '2024-01-01' } });

  const saveBtn = within(modal).getByText('Сохранить');
  await waitFor(() => expect(saveBtn).toBeEnabled());
  await userEvent.click(saveBtn);

  await waitFor(() => expect(getDB().clients[0].group).toBe('индивидуальные'));
  expect(getDB().clients[0].payAmount).toBeDefined();
});
