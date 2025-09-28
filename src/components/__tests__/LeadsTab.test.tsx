// @ts-nocheck
import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
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
  todayISO: jest.fn(() => '2024-01-01T00:00:00.000Z'),
  uid: jest.fn(() => 'uid-123'),
  fmtDate: (iso: string) => iso,
}));

import LeadsTab from '../LeadsTab';
import QuickAddModal from '../QuickAddModal';
import { commitDBUpdate } from '../../state/appState';
import { todayISO, uid } from '../../state/utils';

beforeEach(() => {
  jest.clearAllMocks();
  commitDBUpdate.mockImplementation(async (next, setDB) => {
    setDB(next);
    return true;
  });
  global.confirm = jest.fn(() => true);
  global.prompt = jest.fn();
  window.alert = jest.fn();
});

const makeDB = () => ({
  clients: [],
  attendance: [],
  schedule: [],
  leads: [
    {
      id: 'l1',
      name: 'Лид1',
      parentName: 'П1',
      firstName: 'Иван',
      lastName: 'Иванов',
      birthDate: '2015-01-01T00:00:00.000Z',
      startDate: '2024-01-01T00:00:00.000Z',
      area: 'Area1',
      group: 'Group1',
      source: 'Instagram',
      stage: 'Очередь',
      phone: '123',
      telegram: '@lead1',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'l2',
      name: 'Лид2',
      parentName: 'П2',
      firstName: 'Петр',
      lastName: 'Петров',
      birthDate: '2014-02-02T00:00:00.000Z',
      startDate: '2024-01-02T00:00:00.000Z',
      area: 'Area1',
      group: 'Group1',
      source: 'Telegram',
      stage: 'Пробное',
      whatsApp: '456',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  leadsArchive: [],
  tasks: [],
  tasksArchive: [],
  staff: [],
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

const renderLeads = (db = makeDB()) => {
  let current = db;
  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    const setDB = (next) => { current = next; setState(next); };
    return <LeadsTab db={state} setDB={setDB} />;
  };
  const utils = render(<Wrapper />);
  return { ...utils, getDB: () => current };
};

test('create: adds new lead via modal', async () => {
  const db = makeDB();
  let current = db;
  const Wrapper = () => {
    const [state, setState] = React.useState(db);
    const [open, setOpen] = React.useState(true);
    const setDB = (next) => { current = next; setState(next); };
  const addLead = async () => {
      const l = {
        id: uid(),
        name: 'Новый лид',
        parentName: '',
        firstName: 'Новый',
        lastName: 'Лид',
        birthDate: '2017-01-01T00:00:00.000Z',
        startDate: todayISO(),
        area: state.settings.areas[0],
        group: state.settings.groups[0],
        source: 'Instagram',
        stage: 'Очередь',
        phone: '',
        whatsApp: '',
        telegram: '',
        instagram: '',
        createdAt: todayISO(),
        updatedAt: todayISO(),
      };
      const next = { ...state, leads: [l, ...state.leads] };
      const ok = await commitDBUpdate(next, setDB);
      if (ok) {
        setOpen(false);
      }
    };
    return (
      <>
        <LeadsTab db={state} setDB={setDB} />
        <QuickAddModal open={open} onClose={() => setOpen(false)} onAddClient={() => {}} onAddLead={addLead} onAddTask={() => {}} />
      </>
    );
  };
  render(<Wrapper />);
  await userEvent.click(screen.getByText('+ Лида'));
  expect(current.leads).toHaveLength(3);
  expect(screen.getByText('Новый лид')).toBeInTheDocument();
});

test('read: groups leads by stage', () => {
  renderLeads();
  const queue = screen.getByText('Очередь').parentElement;
  const trial = screen.getByText('Пробное').parentElement;
  expect(within(queue).getByText('Лид1')).toBeInTheDocument();
  expect(within(trial).getByText('Лид2')).toBeInTheDocument();
});

test('update: saves changes from modal', async () => {
  const { getDB } = renderLeads();
  await userEvent.click(screen.getByRole('button', { name: 'Лид1' }));
  await userEvent.click(screen.getByText('Редактировать'));
  const nameInput = await screen.findByPlaceholderText('Имя');
  fireEvent.change(nameInput, { target: { value: 'Лид1 обнов' } });
  fireEvent.submit(nameInput.closest('form'));
  await waitFor(() => expect(getDB().leads.find(l => l.id === 'l1').name).toBe('Лид1 обнов'));
  expect(screen.getByText('Лид1 обнов')).toBeInTheDocument();
});

test('delete: removes lead from list', async () => {
  const { getDB } = renderLeads();
  await userEvent.click(screen.getByRole('button', { name: 'Лид2' }));
  await userEvent.click(screen.getByText('Удалить'));
  expect(global.confirm).toHaveBeenCalled();
  await waitFor(() => expect(getDB().leads.find(l => l.id === 'l2')).toBeUndefined());
  expect(screen.queryByText('Лид2')).not.toBeInTheDocument();
});

test('move: changes stage with arrows', async () => {
  const { getDB } = renderLeads();
  const queue = screen.getByText('Очередь').parentElement;
  const leadItem = within(queue).getByRole('button', { name: 'Лид1' }).closest('div');
  await userEvent.click(within(leadItem).getByText('▶'));
  const delay = screen.getByText('Задержка').parentElement;
  expect(within(delay).getByText('Лид1')).toBeInTheDocument();
  expect(getDB().leads.find(l => l.id === 'l1').stage).toBe('Задержка');
});

test('convert: transforms lead into client via action', async () => {
  const base = makeDB();
  const db = {
    ...base,
    leads: [
      {
        ...base.leads[0],
        stage: 'Ожидание оплаты',
      },
    ],
  };
  const { getDB } = renderLeads(db);
  await userEvent.click(screen.getByRole('button', { name: 'Лид1' }));
  await userEvent.click(screen.getByText('Оплаченный лид'));
  await waitFor(() => expect(getDB().leads).toHaveLength(0));
  expect(getDB().clients).toHaveLength(1);
  const created = getDB().clients[0];
  expect(created.firstName).toBe('Иван');
  expect(created.group).toBe('Group1');
  expect(created.status).toBe('новый');
  expect(created.payStatus).toBe('ожидание');
});

test('archive: moves lead to archive list', async () => {
  const { getDB } = renderLeads();
  await userEvent.click(screen.getByRole('button', { name: 'Лид1' }));
  await userEvent.click(screen.getByText('Отмена'));
  await waitFor(() => expect(getDB().leads.find(l => l.id === 'l1')).toBeUndefined());
  expect(getDB().leadsArchive).toHaveLength(1);
  expect(getDB().leadsArchive[0].id).toBe('l1');
});
