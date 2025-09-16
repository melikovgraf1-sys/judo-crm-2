import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import QuickAddModal from '../QuickAddModal';

describe('QuickAddModal', () => {
  test('calls callbacks when corresponding buttons are clicked', async () => {
    const onAddClient = jest.fn();
    const onAddLead = jest.fn();
    const onAddTask = jest.fn();
    const onClose = jest.fn();

    render(
      <QuickAddModal
        open={true}
        onAddClient={onAddClient}
        onAddLead={onAddLead}
        onAddTask={onAddTask}
        onClose={onClose}
      />
    );

    await userEvent.click(screen.getByText('+ Клиента'));
    await userEvent.click(screen.getByText('+ Лида'));
    await userEvent.click(screen.getByText('+ Задачу'));
    await userEvent.click(screen.getByText('Закрыть'));

    expect(onAddClient).toHaveBeenCalledTimes(1);
    expect(onAddLead).toHaveBeenCalledTimes(1);
    expect(onAddTask).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not render content when modal is closed', () => {
    const { container } = render(
      <QuickAddModal
        open={false}
        onAddClient={jest.fn()}
        onAddLead={jest.fn()}
        onAddTask={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Быстро добавить')).not.toBeInTheDocument();
  });
});
