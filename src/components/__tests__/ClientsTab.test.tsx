// @ts-nocheck
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('react-window', () => ({
  FixedSizeList: ({ itemCount, children }) => (
    <div>{Array.from({ length: itemCount }).map((_, index) => children({ index, style: {} }))}</div>
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
  fmtMoney: jest.fn(),
  fmtDate: jest.fn(),
  parseDateInput: jest.fn(),
  calcAgeYears: jest.fn(),
  calcExperience: jest.fn(),
}));

import ClientsTab from '../ClientsTab';
import { commitDBUpdate } from '../../state/appState';
import { uid, todayISO, fmtMoney, fmtDate, parseDateInput, calcAgeYears, calcExperience } from '../../state/utils';

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  commitDBUpdate.mockImplementation(async (next, setDB) => {
    setDB(next);
    return true;
  });
  uid.mockReturnValue('uid-123');
  todayISO.mockReturnValue('2024-01-01T00:00:00.000Z');
  fmtMoney.mockImplementation((value, currency) => `${value} ${currency}`);
  fmtDate.mockImplementation(iso => iso);
  parseDateInput.mockImplementation(value => (value ? `${value}T00:00:00.000Z` : ''));
  calcAgeYears.mockReturnValue(10);
  calcExperience.mockReturnValue('1 год');
  window.alert = jest.fn();
  global.confirm = jest.fn(() => true);
});

const makeDB = () => ({
  clients: [],
  attendance: [],
  performance: [],
  schedule: [
    { id: 'slot-1', area: 'Area1', group: 'Group1', coachId: 's1', weekday: 1, time: '10:00', location: '' },
  ],
  leads: [],
  tasks: [],
  tasksArchive: [],
  staff: [{ id: 's1', role: 'Тренер', name: 'Coach1', areas: ['Area1'], groups: ['Group1'] }],
  settings: {
    areas: ['Area1'],
    groups: ['Group1'],
    limits: {},
    rentByAreaEUR: {},
    coachSalaryByAreaEUR: {},
    currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
    coachPayFormula: '',
  },
  changelog: [],
});

const makeUI = (overrides = {}) => ({
  role: 'Администратор',
  activeTab: 'clients',
  breadcrumbs: [],
  currency: 'EUR',
  search: '',
  theme: 'light',
  ...overrides,
});

const makeClient = (overrides = {}) => ({
  id: 'client-1',
  firstName: 'Иван',
  lastName: 'Иванов',
  phone: '123',
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

test('search filters clients by full name', () => {
  const db = makeDB();
  db.clients = [
    makeClient({ id: 'c1', firstName: 'Иван', lastName: 'Иванов' }),
    makeClient({ id: 'c2', firstName: 'Пётр', lastName: 'Сидоров' }),
  ];

  const { rerender } = render(<ClientsTab db={db} setDB={() => {}} ui={makeUI()} />);
  expect(screen.getByText('Всего клиентов: 2')).toBeInTheDocument();
  expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
  expect(screen.getByText('Пётр Сидоров')).toBeInTheDocument();

  rerender(<ClientsTab db={db} setDB={() => {}} ui={makeUI({ search: 'пётр' })} />);
  expect(screen.getByText('Найдено: 1 из 2')).toBeInTheDocument();
  expect(screen.getByText('Пётр Сидоров')).toBeInTheDocument();
  expect(screen.queryByText('Иван Иванов')).not.toBeInTheDocument();
});

test('create: adds client through modal', async () => {
  const Wrapper = () => {
    const [state, setState] = React.useState(makeDB());
    return <ClientsTab db={state} setDB={setState} ui={makeUI()} />;
  };

  render(<Wrapper />);
  expect(screen.getByText('Всего клиентов: 0')).toBeInTheDocument();
  await userEvent.click(screen.getByText('+ Добавить клиента'));
  const modal = screen.getByText('Новый клиент').parentElement;
  const firstName = modal.querySelector('input[name="firstName"]') ?? modal.querySelector('input');
  const phone = modal.querySelector('input[name="phone"]');
  const birthDate = modal.querySelector('input[name="birthDate"]');
  const startDate = modal.querySelector('input[name="startDate"]');

  await userEvent.clear(firstName);
  await userEvent.type(firstName, 'Мария');
  if (phone) await userEvent.type(phone, '987');
  if (birthDate) fireEvent.change(birthDate, { target: { value: '2010-01-01' } });
  if (startDate) fireEvent.change(startDate, { target: { value: '2024-01-01' } });

  const save = screen.getByRole('button', { name: 'Сохранить' });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);

  await waitFor(() => expect(screen.getByText('Всего клиентов: 1')).toBeInTheDocument());
  expect(screen.getByText(/^Мария/)).toBeInTheDocument();
});
