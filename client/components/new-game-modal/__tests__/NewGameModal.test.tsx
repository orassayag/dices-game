import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewGameModal } from '../NewGameModal';

function renderModal(overrides: Partial<Parameters<typeof NewGameModal>[0]> = {}) {
  const props = {
    targetScore: 100,
    mode: 'human' as const,
    aiSeat: 2 as const,
    onTargetScoreChange: vi.fn(),
    onModeChange: vi.fn(),
    onAiSeatChange: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    busy: false,
    ...overrides,
  };
  return { props, ...render(<NewGameModal {...props} />) };
}

describe('NewGameModal', () => {
  it('should submit on form submit', () => {
    const { props } = renderModal();
    fireEvent.submit(screen.getByRole('dialog'));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('should report a valid target-score change', () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByLabelText(/Goal score/i), { target: { value: '150' } });
    expect(props.onTargetScoreChange).toHaveBeenCalledWith(150);
  });

  it('should ignore a negative target-score change', () => {
    const { props } = renderModal();
    fireEvent.change(screen.getByLabelText(/Goal score/i), { target: { value: '-5' } });
    expect(props.onTargetScoreChange).not.toHaveBeenCalled();
  });

  it('should block minus, plus, and exponent keys', () => {
    renderModal();
    const input = screen.getByLabelText(/Goal score/i);
    for (const key of ['-', '+', 'e', 'E']) {
      const event = fireEvent.keyDown(input, { key });
      expect(event).toBe(false);
    }
  });

  it('should show the AI-seat selector only in AI mode', () => {
    const { rerender, props } = renderModal({ mode: 'human' });
    expect(screen.queryByLabelText(/AI plays seat/i)).not.toBeInTheDocument();

    rerender(<NewGameModal {...props} mode="ai" />);
    expect(screen.getByLabelText(/AI plays seat/i)).toBeInTheDocument();
  });

  it('should hide the cancel controls when onCancel is null', () => {
    renderModal({ onCancel: null });
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('should call onCancel from the close button', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onCancel).toHaveBeenCalled();
  });

  it('should change mode and ai-seat through the selects', () => {
    const { props } = renderModal({ mode: 'ai' });
    fireEvent.change(screen.getByLabelText(/Opponent/i), { target: { value: 'ai' } });
    expect(props.onModeChange).toHaveBeenCalledWith('ai');

    fireEvent.change(screen.getByLabelText(/AI plays seat/i), { target: { value: '1' } });
    expect(props.onAiSeatChange).toHaveBeenCalledWith(1);
  });
});
