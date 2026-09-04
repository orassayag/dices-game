import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Leaderboard } from '../Leaderboard';

describe('Leaderboard', () => {
  it('should render both player names and their win counts', () => {
    render(
      <Leaderboard
        entries={[
          { id: 'seat1', name: 'James Carter', wins: 2 },
          { id: 'seat2', name: 'Ryan Mitchell', wins: 5 },
        ]}
      />,
    );

    expect(screen.getByText('James Carter')).toBeInTheDocument();
    expect(screen.getByText('Ryan Mitchell')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'span.text-accent' })).toBeInTheDocument();
    expect(screen.getByText('5', { selector: 'span.text-accent' })).toBeInTheDocument();
  });

  it('should place the player with more wins in the top row and the other in the second row', () => {
    render(
      <Leaderboard
        entries={[
          { id: 'seat1', name: 'James Carter', wins: 2 },
          { id: 'seat2', name: 'Ryan Mitchell', wins: 5 },
        ]}
      />,
    );

    expect(screen.getByText('Ryan Mitchell').closest('div')).toHaveStyle({
      transform: 'translateY(0px)',
    });
    expect(screen.getByText('James Carter').closest('div')).toHaveStyle({
      transform: 'translateY(44px)',
    });
    expect(screen.getByText('2', { selector: 'span[aria-hidden]' })).toBeInTheDocument();
  });

  it('should keep seat 1 in the top row when both players are tied on wins', () => {
    render(
      <Leaderboard
        entries={[
          { id: 'seat1', name: 'James Carter', wins: 3 },
          { id: 'seat2', name: 'Ryan Mitchell', wins: 3 },
        ]}
      />,
    );

    expect(screen.getByText('James Carter').closest('div')).toHaveStyle({
      transform: 'translateY(0px)',
    });
    expect(screen.getByText('Ryan Mitchell').closest('div')).toHaveStyle({
      transform: 'translateY(44px)',
    });
  });

  it('should move a row to the top row when its win count overtakes the other', () => {
    const { rerender } = render(
      <Leaderboard
        entries={[
          { id: 'seat1', name: 'James Carter', wins: 1 },
          { id: 'seat2', name: 'Ryan Mitchell', wins: 0 },
        ]}
      />,
    );
    expect(screen.getByText('James Carter').closest('div')).toHaveStyle({
      transform: 'translateY(0px)',
    });

    rerender(
      <Leaderboard
        entries={[
          { id: 'seat1', name: 'James Carter', wins: 1 },
          { id: 'seat2', name: 'Ryan Mitchell', wins: 2 },
        ]}
      />,
    );

    expect(screen.getByText('Ryan Mitchell').closest('div')).toHaveStyle({
      transform: 'translateY(0px)',
    });
    expect(screen.getByText('James Carter').closest('div')).toHaveStyle({
      transform: 'translateY(44px)',
    });
  });

  it('should keep a third entry (the AI) visible alongside both seats, never removing one', () => {
    render(
      <Leaderboard
        entries={[
          { id: 'seat1', name: 'James Carter', wins: 1 },
          { id: 'seat2', name: 'Ryan Mitchell', wins: 4 },
          { id: 'ai', name: 'AI Dices BOT', wins: 2 },
        ]}
      />,
    );

    expect(screen.getByText('James Carter')).toBeInTheDocument();
    expect(screen.getByText('Ryan Mitchell')).toBeInTheDocument();
    expect(screen.getByText('AI Dices BOT')).toBeInTheDocument();
  });
});
