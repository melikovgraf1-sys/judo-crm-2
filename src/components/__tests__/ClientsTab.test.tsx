// @ts-nocheck
import React from 'react';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('react-window', () => ({
  FixedSizeList: ({ itemCount, children }) => (
    <div>{Array.from({ length: itemCount }).map((_, index) => children({ index, style: {} }))}</div>
  ),
}), { virtual: true });

jest.mock('../../state/appState', () => ({
  __esModule: true,
  commitDBUpdate: jest.fn(),
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
  calcExperienceMonths: jest.fn(),
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

import ClientsTab from '../ClientsTab';
import { commitDBUpdate } from '../../state/appState';
import { uid, todayISO, fmtMoney, fmtDate, parseDateInput, calcAgeYears, calcExperience, calcExperienceMonths } from '../../state/utils';

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  commitDBUpdate.mockImplementation(async (next, setDB) => {
    setDB(next);
    return { ok: true, db: next };
  });
  uid.mockReturnValue('uid-123');
  todayISO.mockReturnValue('2024-01-01T00:00:00.000Z');
  fmtMoney.mockImplementation((value, currency) => `${value} ${currency}`);
  fmtDate.mockImplementation(iso => iso);
  parseDateInput.mockImplementation(value => (value ? `${value}T00:00:00.000Z` : ''));
  calcAgeYears.mockReturnValue(10);
  calcExperience.mockReturnValue('1 год');
  calcExperienceMonths.mockReturnValue(12);
  window.alert = jest.fn();
  global.confirm = jest.fn(() => true);
});

const makeDB = () => ({
  revision: 0,
  clients: [],
  attendance: [],
  performance: [],
  schedule: [
    { id: 'slot-1', area: 'Area1', group: 'Group1', coachId: 's1', weekday: 1, time: '10:00', location: '' },
  ],
  leads: [],
  leadsArchive: [],
  leadHistory: [],
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
    analyticsFavorites: [],
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
  pendingClientId: null,
  ...overrides,
});

const makeClient = (overrides = {}) => ({
  id: 'client-1',
  firstName: 'Иван',
  lastName: 'Иванов',
  phone: '123',
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
  placements: [
    {
      id: 'pl-client-1',
      area: 'Area1',
      group: 'Group1',
      payStatus: 'ожидание',
      status: 'действующий',
      subscriptionPlan: 'monthly',
      payDate: '2024-01-10T00:00:00.000Z',
      payAmount: 55,
      remainingLessons: 5,
    },
  ],
  ...overrides,
});

test('search filters clients by full name', async () => {
  const db = makeDB();
  db.clients = [
    makeClient({ id: 'c1', firstName: 'Иван', lastName: 'Иванов' }),
    makeClient({ id: 'c2', firstName: 'Пётр', lastName: 'Сидоров' }),
  ];

  render(<ClientsTab db={db} setDB={() => {}} ui={makeUI()} setUI={() => {}} />);
  expect(screen.getByText('Всего клиентов: 2')).toBeInTheDocument();
  expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
  expect(screen.getByText('Пётр Сидоров')).toBeInTheDocument();

  const searchInput = screen.getByPlaceholderText('Поиск клиента…');
  await userEvent.type(searchInput, 'пётр');
  expect(screen.getByText('Найдено: 1 из 2')).toBeInTheDocument();
  expect(screen.getByText('Пётр Сидоров')).toBeInTheDocument();
  expect(screen.queryByText('Иван Иванов')).not.toBeInTheDocument();
});

test('create: adds client through modal', async () => {
  const Wrapper = () => {
    const [state, setState] = React.useState(makeDB());
    return <ClientsTab db={state} setDB={setState} ui={makeUI()} setUI={() => {}} />;
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

test('create: warns about duplicates and allows opening existing client', async () => {
  const existing = makeClient({ id: 'c-existing', phone: '+7 (900) 123-45-67', firstName: 'Иван', lastName: 'Иванов' });

  const Wrapper = () => {
    const [state, setState] = React.useState({ ...makeDB(), clients: [existing] });
    return <ClientsTab db={state} setDB={setState} ui={makeUI()} setUI={() => {}} />;
  };

  render(<Wrapper />);

  await userEvent.click(screen.getByText('+ Добавить клиента'));
  const modal = screen.getByText('Новый клиент').parentElement!;
  const firstName = modal.querySelector('input[name="firstName"]') ?? modal.querySelector('input');
  const phone = modal.querySelector('input[name="phone"]');
  const birthDate = modal.querySelector('input[name="birthDate"]');
  const startDate = modal.querySelector('input[name="startDate"]');

  await userEvent.clear(firstName!);
  await userEvent.type(firstName!, 'Мария');
  if (phone) await userEvent.type(phone, '8 900 123 45 67');
  if (birthDate) fireEvent.change(birthDate, { target: { value: '2010-01-01' } });
  if (startDate) fireEvent.change(startDate, { target: { value: '2024-01-01' } });

  const save = screen.getByRole('button', { name: 'Сохранить' });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);

  const duplicateModal = await screen.findByText('Найдены возможные дубликаты');
  expect(duplicateModal).toBeInTheDocument();
  expect(within(duplicateModal.parentElement as HTMLElement).getByText('Иван Иванов')).toBeInTheDocument();

  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
  });

  await screen.findByText('Редактирование клиента');
  expect(screen.queryByText('Найдены возможные дубликаты')).not.toBeInTheDocument();
  const editModal = screen.getByText('Редактирование клиента').parentElement!;
  const firstNameInput = within(editModal).getByDisplayValue('Иван');
  expect(firstNameInput).toBeInTheDocument();
});

test('create: can proceed after duplicate warning', async () => {
  const existing = makeClient({ id: 'c-existing', phone: '+7 (900) 123-45-67', firstName: 'Иван', lastName: 'Иванов' });

  const Wrapper = () => {
    const [state, setState] = React.useState({ ...makeDB(), clients: [existing] });
    return <ClientsTab db={state} setDB={setState} ui={makeUI()} setUI={() => {}} />;
  };

  render(<Wrapper />);

  await userEvent.click(screen.getByText('+ Добавить клиента'));
  const modal = screen.getByText('Новый клиент').parentElement!;
  const firstName = modal.querySelector('input[name="firstName"]') ?? modal.querySelector('input');
  const phone = modal.querySelector('input[name="phone"]');
  const birthDate = modal.querySelector('input[name="birthDate"]');
  const startDate = modal.querySelector('input[name="startDate"]');

  await userEvent.clear(firstName!);
  await userEvent.type(firstName!, 'Мария');
  if (phone) await userEvent.type(phone, '+7 9001234567');
  if (birthDate) fireEvent.change(birthDate, { target: { value: '2010-01-01' } });
  if (startDate) fireEvent.change(startDate, { target: { value: '2024-01-01' } });

  const save = screen.getByRole('button', { name: 'Сохранить' });
  await waitFor(() => expect(save).toBeEnabled());
  await userEvent.click(save);

  await screen.findByText('Найдены возможные дубликаты');

  await act(async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Создать всё равно' }));
  });

  await waitFor(() => expect(screen.getByText('Всего клиентов: 2')).toBeInTheDocument());
  expect(screen.queryByText('Найдены возможные дубликаты')).not.toBeInTheDocument();
  expect(screen.getByText(/^Мария/)).toBeInTheDocument();
});

test('waiting action moves client to ожидание and clears pay actual display', async () => {
  const client = makeClient({
    id: 'c-wait',
    firstName: 'Анна',
    payStatus: 'действует',
    payActual: 100,
    placements: [
      {
        id: 'pl-c-wait',
        area: 'Area1',
        group: 'Group1',
        payStatus: 'действует',
        status: 'действующий',
        subscriptionPlan: 'monthly',
        payDate: '2024-01-10T00:00:00.000Z',
        payAmount: 55,
        payActual: 100,
        remainingLessons: 5,
      },
    ],
  });

  const Wrapper = () => {
    const [state, setState] = React.useState({ ...makeDB(), clients: [client] });
    return <ClientsTab db={state} setDB={setState} ui={makeUI()} setUI={() => {}} />;
  };

  render(<Wrapper />);

  const waitingButton = screen.getByRole('button', { name: 'ожидание' });
  await userEvent.click(waitingButton);

  await waitFor(() => expect(commitDBUpdate).toHaveBeenCalled());

  const updatedClient = commitDBUpdate.mock.calls.at(-1)?.[0]?.clients?.find((entry: any) => entry.id === 'c-wait');
  expect(updatedClient?.payStatus).toBe('ожидание');
  expect(updatedClient?.payActual).toBeUndefined();
  expect(updatedClient?.placements?.[0]?.payStatus).toBe('ожидание');
  expect(updatedClient?.placements?.[0]?.payActual).toBeUndefined();

  await waitFor(() => expect(screen.queryByRole('button', { name: 'ожидание' })).not.toBeInTheDocument());
});

test('client details hide fact payment when overall status is ожидание', async () => {
  const client = makeClient({
    id: 'c-details-wait',
    firstName: 'Олег',
    payStatus: 'ожидание',
    payActual: 55,
    placements: [
      {
        id: 'pl-c-details-wait',
        area: 'Area1',
        group: 'Group1',
        payStatus: 'ожидание',
        status: 'действующий',
        subscriptionPlan: 'monthly',
        payDate: '2024-01-10T00:00:00.000Z',
        payAmount: 55,
        payActual: 55,
        remainingLessons: 5,
      },
    ],
  });

  const Wrapper = () => {
    const [state, setState] = React.useState({ ...makeDB(), clients: [client] });
    return <ClientsTab db={state} setDB={setState} ui={makeUI()} setUI={() => {}} />;
  };

  render(<Wrapper />);

  await userEvent.click(screen.getByText('Олег Иванов'));

  const modal = await screen.findByRole('dialog');
  const forbiddenLabels = [
    'Форма абонемента',
    'Дата оплаты',
    'Сумма оплаты, €',
    'Факт оплаты, €',
    'Остаток занятий',
  ];
  forbiddenLabels.forEach(label => {
    expect(within(modal).queryByText(label)).not.toBeInTheDocument();
  });
});
