import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('react-window', () => ({
  FixedSizeList: ({ itemCount, children }) => (
    <div>{Array.from({ length: itemCount }).map((_, i) => children({ index: i, style: {} }))}</div>
  ),
}), { virtual: true });

jest.mock('../../App', () => ({
  __esModule: true,
  uid: jest.fn(),
  todayISO: jest.fn(),
  saveDB: jest.fn(),
  parseDateInput: jest.fn(),
  fmtMoney: jest.fn(),
}));

import ClientsTab from '../ClientsTab';
import { uid, todayISO, saveDB, parseDateInput, fmtMoney } from '../../App';

beforeEach(() => {
  jest.clearAllMocks();
  uid.mockReturnValue('uid-123');
  todayISO.mockReturnValue('2024-01-01T00:00:00.000Z');
  parseDateInput.mockImplementation((v) => (v ? v + 'T00:00:00.000Z' : ''));
  fmtMoney.mockImplementation((v, c) => v + ' ' + c);
  global.confirm = jest.fn(() => true);
});

const makeDB = () => ({
  clients: [],
  attendance: [],
  schedule: [],
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

const renderClients = (db = makeDB(), ui = makeUI()) => {
  let current = db;
  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    const [uiState] = React.useState(ui);
    const setDB = (next) => { current = next; setState(next); };
    return <ClientsTab db={state} setDB={setDB} ui={uiState} />;
  };
  const utils = render(<Wrapper />);
  return { ...utils, getDB: () => current };
};


test('create: adds client through modal', async () => {
  const { getDB } = renderClients();

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

  await waitFor(() => expect(screen.getByText(/^Вася/)).toBeInTheDocument());
  expect(getDB().clients).toHaveLength(1);
});

test('read: filters clients by area, group and pay status', async () => {
  const db = makeDB();
  db.clients = [
    { id: 'c1', firstName: 'A', lastName: '', phone: '', area: 'Area1', group: 'Group1', payStatus: 'ожидание', payAmount: 0 },
    { id: 'c2', firstName: 'B', lastName: '', phone: '', area: 'Area2', group: 'Group1', payStatus: 'действует', payAmount: 0 },
    { id: 'c3', firstName: 'C', lastName: '', phone: '', area: 'Area1', group: 'Group2', payStatus: 'задолженность', payAmount: 0 },
  ];
  const { getByText } = renderClients(db);

  expect(getByText('A')).toBeInTheDocument();
  expect(getByText('B')).toBeInTheDocument();
  expect(getByText('C')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Area1' }));
  expect(getByText('A')).toBeInTheDocument();
  expect(getByText('C')).toBeInTheDocument();
  expect(screen.queryByText('B')).not.toBeInTheDocument();

  await userEvent.click(getByText('Все районы'));
  const [groupSelect, paySelect] = screen.getAllByRole('combobox');

  await userEvent.selectOptions(groupSelect, 'Group2');
  expect(getByText('C')).toBeInTheDocument();
  expect(screen.queryByText('A')).not.toBeInTheDocument();
  expect(screen.queryByText('B')).not.toBeInTheDocument();

  await userEvent.selectOptions(groupSelect, 'all');
  await userEvent.selectOptions(paySelect, 'действует');
  expect(getByText('B')).toBeInTheDocument();
  expect(screen.queryByText('A')).not.toBeInTheDocument();
  expect(screen.queryByText('C')).not.toBeInTheDocument();
});

test('update: edits client name', async () => {
  const db = makeDB();
  db.clients = [
    {
      id: 'c1',
      firstName: 'Old',
      lastName: '',
      phone: '123',
      area: 'Area1',
      group: 'Group1',
      payStatus: 'ожидание',
      payAmount: 0,
      birthDate: '2010-01-01T00:00:00.000Z',
      startDate: '2024-01-01T00:00:00.000Z',
    },
  ];
  const { getDB } = renderClients(db);

  await userEvent.click(screen.getByText('Редактировать'));
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
  db.clients = [
    { id: 'c1', firstName: 'Del', lastName: '', phone: '', area: 'Area1', group: 'Group1', payStatus: 'ожидание', payAmount: 0 },
  ];
  const { getDB } = renderClients(db);

  await userEvent.click(screen.getByText('Удалить'));

  expect(global.confirm).toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByText('Del')).not.toBeInTheDocument());
  expect(getDB().clients.find(c => c.id === 'c1')).toBeUndefined();
});
