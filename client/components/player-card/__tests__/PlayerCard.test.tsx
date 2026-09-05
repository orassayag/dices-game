import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayerCard } from '../PlayerCard';

function renderCard(overrides: Partial<Parameters<typeof PlayerCard>[0]> = {}) {
  return render(
    <PlayerCard
      seatNumber={1}
      name="Alice"
      avatarSrc="https://example.com/a.png"
      score={12}
      isCurrentTurn={false}
      isWinner={false}
      isThinking={false}
      {...overrides}
    />,
  );
}

describe('PlayerCard', () => {
  it('should render the seat, name, and score', () => {
    renderCard();
    expect(screen.getByText('Player 1')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('should announce thinking state for the AI', () => {
    renderCard({ isThinking: true });
    expect(screen.getByText('Player 1 (AI) is thinking…')).toBeInTheDocument();
  });

  it('should show the winner banner when winning', () => {
    renderCard({ isWinner: true });
    expect(screen.getByText('Winner!')).toBeInTheDocument();
  });

  it('should hide the loading placeholder once the avatar loads', () => {
    renderCard();
    const image = screen.getByAltText("Player 1's avatar");
    fireEvent.load(image);
    expect(image).toBeInTheDocument();
  });

  it('should swap to the fallback avatar on image error', () => {
    renderCard({ name: 'Bob' });
    const image = screen.getByAltText("Player 1's avatar") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.src.startsWith('data:image/svg+xml,')).toBe(true);
    expect(image.onerror).toBeNull();
  });
});
