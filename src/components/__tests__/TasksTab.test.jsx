import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
jest.mock('../../state/appState', () => ({
  fmtDate: (iso) => new Intl.DateTimeFormat('ru-RU').format(new Date(iso)),
  uid: () => 'uid',
  saveDB: () => {},
  todayISO: () => '2025-01-01T00:00:00.000Z'
}));
import TasksTab from '../TasksTab';

function setup(initialTasks) {
  const Wrapper = () => {
    const [db, setDB] = React.useState({ tasks: initialTasks });
    return <TasksTab db={db} setDB={setDB} />;
  };
  return render(<Wrapper />);
}

describe('TasksTab CRUD operations', () => {
  const tasks = [
    { id: 't1', title: 'Первая', due: '2025-01-01T00:00:00.000Z', status: 'open' },
    { id: 't2', title: 'Вторая', due: '2025-02-02T00:00:00.000Z', status: 'open' }
  ];

  beforeEach(() => {
    window.confirm = jest.fn(() => true);
    localStorage.clear();
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

  test('Toggle: checkbox toggles status', async () => {
    setup(tasks);
    const checkbox = screen.getAllByRole('checkbox')[0];
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});
