import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getItems, createItem } from '../../../api/items';
import { ItemList } from '../ItemList';

vi.mock('../../../api/items');

const mockItem = { id: 1, name: 'Test item', created_at: '', updated_at: '' };
const mockCreated = { id: 2, name: 'New item', created_at: '', updated_at: '' };

beforeEach(() => {
  vi.mocked(getItems).mockResolvedValue([mockItem]);
  vi.mocked(createItem).mockResolvedValue(mockCreated);
});

describe('ItemList', () => {
  it('should show loading then render items', async () => {
    render(<ItemList />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Test item')).toBeInTheDocument();
    });
  });

  it('should add a new item on form submit', async () => {
    const user = userEvent.setup();
    render(<ItemList />);
    await waitFor(() => screen.getByText('Test item'));

    await user.type(screen.getByPlaceholderText('Item name'), 'New item');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('New item')).toBeInTheDocument();
    });
  });
});
