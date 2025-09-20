// @ts-nocheck
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('react-window', () => ({
  FixedSizeList: ({ itemCount, children }) => (
    <div>{Array.from({ length: itemCount }).map((_, i) => children({ index: i, style: {} }))}</div>
  ),
}), { virtual: true });

jest.mock('../../state/appState', () => ({
  __esModule: true,
  commitDBUpdate: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../state/utils', () => ({
  __esModule: true,
  uid: jest.fn(),
  todayISO: jest.fn(),
  parseDateInput: jest.fn(),
  fmtMoney: jest.fn(),
  fmtDate: jest.fn(),
}));

import ClientsTab from '../ClientsTab';
import { commitDBUpdate } from '../../state/appState';
import { uid, todayISO, parseDateInput, fmtMoney, fmtDate } from '../../state/utils';

beforeEach(() => {
  jest.clearAllMocks();
  commitDBUpdate.mockImplementation(async (next, setDB) => {
    setDB(next);
    return true;
  });
  uid.mockReturnValue('uid-123');
  todayISO.mockReturnValue('2024-01-01T00:00:00.000Z');
  parseDateInput.mockImplementation((v) => (v ? v + 'T00:00:00.000Z' : ''));
  fmtMoney.mockImplementation((v, c) => v + ' ' + c);
  fmtDate.mockImplementation((iso) => iso);
  global.confirm = jest.fn(() => true);
  window.alert = jest.fn();
});

const makeDB = () => ({
  clients: [],
  attendance: [],
  schedule: [
    { id: 'slot-1', area: 'Area1', group: 'Group1', coachId: 's1', weekday: 1, time: '10:00', location: '' },
    { id: 'slot-2', area: 'Area1', group: 'Group2', coachId: 's1', weekday: 2, time: '11:00', location: '' },
    { id: 'slot-3', area: 'Area2', group: 'Group1', coachId: 's1', weekday: 3, time: '12:00', location: '' },
  ],
  leads: [],
  tasks: [],
  staff: [{ id: 's1', role: 'Тренер', name: 'Coach1' }],
  settings: {
    areas: ['Area1', 'Area2'],
    groups: ['Group1', 'Group2'],
    limits: {},
    rentByAreaEUR: {},
    currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
    coachPayFormula: '',
  },
  changelog: [],
});

const makeUI = () => ({
  role: 'Администратор',
  activeTab: 'clients',
  breadcrumbs: [],
  currency: 'EUR',
  search: '',
  theme: 'light',
});

const renderClients = (db = makeDB(), ui = makeUI(), initialFilters = {}) => {
  let current = db;
  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    const [uiState] = React.useState(ui);
    const setDB = (next) => { current = next; setState(next); };
    return <ClientsTab db={state} setDB={setDB} ui={uiState} {...initialFilters} />;
  };
  const utils = render(<Wrapper />);
  return { ...utils, getDB: () => current };
};

const makeClient = (overrides = {}) => ({
  id: 'client-id',
  firstName: 'Имя',
  lastName: '',
  phone: '',
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
  payDate: '2024-01-10T00:00:00.000Z',
  payAmount: 55,
  remainingLessons: 5,
  ...overrides,
});

test('create: adds client through modal', async () => {
  const { getDB, unmount } = renderClients();

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
  renderClients(getDB(), makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
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

  const view1 = renderClients(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.queryByText('B')).not.toBeInTheDocument();
  expect(screen.queryByText('C')).not.toBeInTheDocument();
  view1.unmount();

  const view2 = renderClients(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group2' });
  expect(screen.getByText('C')).toBeInTheDocument();
  expect(screen.queryByText('A')).not.toBeInTheDocument();
  expect(screen.queryByText('B')).not.toBeInTheDocument();
  view2.unmount();

  renderClients(db, makeUI(), { initialArea: 'Area2', initialGroup: 'Group1', initialPay: 'действует' });
  expect(screen.getByText('B')).toBeInTheDocument();
  expect(screen.queryByText('A')).not.toBeInTheDocument();
  expect(screen.queryByText('C')).not.toBeInTheDocument();
});

test('update: edits client name', async () => {
  const db = makeDB();
  db.clients = [
    makeClient({ id: 'c1', firstName: 'Old', phone: '123' }),
  ];
  const { getDB } = renderClients(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
  await waitFor(() => expect(screen.getByRole('button', { name: /Old/ })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /Old/ }));
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

test('delete: removes client after confirmation', async () => {
  const db = makeDB();
  db.clients = [makeClient({ id: 'c1', firstName: 'Del' })];
  const { getDB } = renderClients(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
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

  const { getDB } = renderClients(db, makeUI(), { initialArea: 'Area1', initialGroup: 'Group1' });
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

test('individual group allows custom payment amount', async () => {
  const db = makeDB();
  db.settings.groups = ['Group1', 'индивидуальные'];
  db.schedule.push({ id: 'slot-ind', area: 'Area1', group: 'индивидуальные', coachId: 's1', weekday: 4, time: '13:00', location: '' });

  const { getDB } = renderClients(db);

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
