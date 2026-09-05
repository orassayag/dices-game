import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AI_PLAYER_AVATAR_URL,
  AI_PLAYER_NAME,
  avatarUrl,
  fallbackAvatarUrl,
  generatePlayerIdentities,
  resolveSeatDisplay,
} from '../playerAvatars';

describe('playerAvatars', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('avatarUrl', () => {
    it('should build a pravatar URL for the given image id', () => {
      expect(avatarUrl(7)).toBe('https://i.pravatar.cc/150?img=7');
    });
  });

  describe('fallbackAvatarUrl', () => {
    it('should encode the uppercased first initial into an svg data URL', () => {
      const url = fallbackAvatarUrl('alice');
      expect(url.startsWith('data:image/svg+xml,')).toBe(true);
      expect(decodeURIComponent(url)).toContain('>A<');
    });

    it('should use "?" when the name is empty', () => {
      expect(decodeURIComponent(fallbackAvatarUrl(''))).toContain('>?<');
    });
  });

  describe('resolveSeatDisplay', () => {
    it('should return the AI identity for an AI seat', () => {
      const display = resolveSeatDisplay({ name: 'ignored', avatarImageId: 5 }, true);
      expect(display).toEqual({ name: AI_PLAYER_NAME, avatarSrc: AI_PLAYER_AVATAR_URL });
    });

    it('should return the human identity for a non-AI seat', () => {
      const display = resolveSeatDisplay({ name: 'Alice', avatarImageId: 5 }, false);
      expect(display).toEqual({ name: 'Alice', avatarSrc: avatarUrl(5) });
    });
  });

  describe('generatePlayerIdentities', () => {
    it('should produce two distinct names and avatar ids', () => {
      const { seat1, seat2 } = generatePlayerIdentities();
      expect(seat1.name).not.toBe(seat2.name);
      expect(seat1.avatarImageId).not.toBe(seat2.avatarImageId);
      expect(seat1.avatarImageId).toBeGreaterThanOrEqual(1);
      expect(seat1.avatarImageId).toBeLessThanOrEqual(70);
    });

    it('should return the first two entries when Math.random keeps order stable', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const { seat1, seat2 } = generatePlayerIdentities();
      expect(seat1.name).not.toBe(seat2.name);
    });
  });
});
