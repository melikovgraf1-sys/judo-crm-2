// @ts-nocheck
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
jest.mock('../../state/appState', () => ({
  __esModule: true,
  commitDBUpdate: jest.fn().mockResolvedValue(true),
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
      tasks: initialTasks,
      tasksArchive: overrides.tasksArchive ?? [],
      clients: overrides.clients ?? [],
      attendance: overrides.attendance ?? [],
      performance: overrides.performance ?? [],
      schedule: overrides.schedule ?? [],
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
      return true;
    });
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
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
