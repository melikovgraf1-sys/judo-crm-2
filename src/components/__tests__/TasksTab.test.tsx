// @ts-nocheck
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
jest.mock('../../state/appState', () => ({
  __esModule: true,
  commitDBUpdate: jest.fn(),
}));

jest.mock('../../state/utils', () => ({
  __esModule: true,
  fmtDate: (iso: string) => new Intl.DateTimeFormat('ru-RU').format(new Date(iso)),
  uid: () => 'uid',
  todayISO: () => '2025-01-01T00:00:00.000Z',
}));

jest.mock('../../state/reserve', () => ({
  __esModule: true,
  isReserveArea: () => false,
  ensureReserveAreaIncluded: (areas: string[]) => areas,
  RESERVE_AREA_NAME: 'резерв',
}));
import TasksTab from '../TasksTab';
import { commitDBUpdate } from '../../state/appState';

function setup(initialTasks, overrides = {}) {
  const Wrapper = () => {
    const [db, setDB] = React.useState({
      revision: 0,
      tasks: initialTasks,
      tasksArchive: overrides.tasksArchive ?? [],
      clients: overrides.clients ?? [],
      attendance: overrides.attendance ?? [],
      performance: overrides.performance ?? [],
      schedule: overrides.schedule ?? [],
      leads: [],
      leadsArchive: [],
      leadHistory: [],
      staff: [],
      settings: {
        areas: [],
        groups: [],
        limits: {},
        rentByAreaEUR: {},
        coachSalaryByAreaEUR: {},
        currencyRates: { EUR: 1, TRY: 1, RUB: 1 },
        coachPayFormula: '',
        analyticsFavorites: [],
      },
      changelog: [],
    });
    return <TasksTab db={db} setDB={setDB} currency="RUB" />;
  };
  return render(<Wrapper />);
}

describe('TasksTab CRUD operations', () => {
  const tasks = [
    { id: 't1', title: 'Первая', due: '2025-01-01T00:00:00.000Z', status: 'open' },
    { id: 't2', title: 'Вторая', due: '2025-02-02T00:00:00.000Z', status: 'open' }
  ];

  beforeEach(() => {
    commitDBUpdate.mockImplementation(async (next, setDB) => {
      setDB(next);
      return { ok: true, db: next };
    });
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
    window.localStorage?.clear();
  });

  test('Read: renders initial tasks', () => {
    setup(tasks);
    expect(screen.getByText('Первая')).toBeInTheDocument();
    expect(screen.getByText('Вторая')).toBeInTheDocument();
  });

  test('Create: adds new task', async () => {
    setup(tasks);
    await userEvent.click(screen.getByText('+ Задача'));
    expect(screen.getByText('Новая задача')).toBeInTheDocument();
  });

  test('Update: editing task saves changes', async () => {
    setup(tasks);
    await userEvent.click(screen.getAllByText('✎')[0]);
    const titleInput = screen.getByDisplayValue('Первая');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Обновленная');
    const dateInput = screen.getByDisplayValue('2025-01-01');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2025-01-02');
    await userEvent.click(screen.getByText('Сохранить'));
    expect(screen.getByText('Обновленная')).toBeInTheDocument();
    expect(screen.getByText('02.01.2025')).toBeInTheDocument();
  });

  test('Delete: removes task from DOM', async () => {
    setup(tasks);
    await userEvent.click(screen.getAllByText('✕')[1]);
    expect(screen.queryByText('Вторая')).not.toBeInTheDocument();
  });

  test('Complete: checkbox moves task to archive', async () => {
    setup(tasks);
    const checkbox = screen.getAllByRole('checkbox')[0];
    await userEvent.click(checkbox);
    expect(screen.queryByText('Первая')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Архив задач'));
    expect(screen.getByText('Первая')).toBeInTheDocument();
  });

  test('Task item click opens modal', async () => {
    setup(tasks);
    await userEvent.click(screen.getByText('Первая'));
    expect(screen.getByText('Редактирование задачи')).toBeInTheDocument();
  });

  test('Modal shows client card action when client is linked', async () => {
    const clientTask = [{
      id: 'tc1',
      title: 'Оплата',
      due: '2025-03-03T00:00:00.000Z',
      status: 'open',
      assigneeType: 'client',
      assigneeId: 'c1',
    }];
    const client = {
      id: 'c1',
      firstName: 'Иван',
      lastName: 'Иванов',
      channel: 'Telegram',
      birthDate: '2015-01-01',
      gender: 'м',
      area: 'A',
      group: 'G',
      startDate: '2020-01-01',
      payMethod: 'наличные',
      payStatus: 'ожидание',
      status: 'новый',
    };
    setup(clientTask, { clients: [client] });
    await userEvent.click(screen.getByText('Оплата'));
    expect(screen.getByText('Открыть карточку клиента')).toBeInTheDocument();
  });
});


describe('TasksTab filtering', () => {
  beforeEach(() => {
    commitDBUpdate.mockImplementation(async (next, setDB) => {
      setDB(next);
      return { ok: true, db: next };
    });
    window.localStorage?.clear();
  });

  const schedule = [
    { id: 's1', area: 'Центр', group: 'Группа A', coachId: 'c', weekday: 1, time: '10:00', location: 'loc' },
    { id: 's2', area: 'Юг', group: 'Группа B', coachId: 'c2', weekday: 2, time: '11:00', location: 'loc' },
  ];

  test('filters active tasks by area and group', async () => {
    const tasks = [
      { id: 't1', title: 'Центр A', due: '2025-01-01T00:00:00.000Z', status: 'open', area: 'Центр', group: 'Группа A' },
      { id: 't2', title: 'Юг B', due: '2025-01-01T00:00:00.000Z', status: 'open', area: 'Юг', group: 'Группа B' },
      { id: 't3', title: 'Без фильтра', due: '2025-01-01T00:00:00.000Z', status: 'open' },
    ];
    setup(tasks, { schedule });

    const [areaSelect, groupSelect] = screen.getAllByRole('combobox');

    await userEvent.selectOptions(areaSelect, 'Центр');
    expect(screen.getByText('Центр A')).toBeInTheDocument();
    expect(screen.queryByText('Юг B')).not.toBeInTheDocument();
    expect(screen.queryByText('Без фильтра')).not.toBeInTheDocument();

    await userEvent.selectOptions(groupSelect, 'Группа A');
    expect(screen.getByText('Центр A')).toBeInTheDocument();
  });

  test('filters archive tasks with the same selection', async () => {
    const tasks = [
      { id: 't1', title: 'Активная', due: '2025-01-01T00:00:00.000Z', status: 'open', area: 'Центр', group: 'Группа A' },
    ];
    const tasksArchive = [
      { id: 'a1', title: 'Архив Центр', due: '2024-01-01T00:00:00.000Z', status: 'done', area: 'Центр', group: 'Группа A' },
      { id: 'a2', title: 'Архив Юг', due: '2024-01-02T00:00:00.000Z', status: 'done', area: 'Юг', group: 'Группа B' },
    ];

    setup(tasks, { tasksArchive, schedule });

    const [areaSelect, groupSelect] = screen.getAllByRole('combobox');
    await userEvent.selectOptions(areaSelect, 'Центр');
    await userEvent.selectOptions(groupSelect, 'Группа A');

    await userEvent.click(screen.getByText('Архив задач'));
    expect(screen.getByText('Архив Центр')).toBeInTheDocument();
    expect(screen.queryByText('Архив Юг')).not.toBeInTheDocument();
  });
});
