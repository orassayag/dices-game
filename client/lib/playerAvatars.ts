import { AI_PLAYER_NAME } from '../../shared/index';

// Re-exported so display code can keep importing it from here, while the value stays
// sourced from the shared contract the server also reads.
export { AI_PLAYER_NAME };

export interface PlayerIdentity {
  name: string;
  avatarImageId: number;
}

export interface PlayerIdentities {
  seat1: PlayerIdentity;
  seat2: PlayerIdentity;
}

const PLAYER_NAMES: string[] = [
  'James Carter',
  'Michael Turner',
  'Daniel Brooks',
  'Ethan Walsh',
  'Benjamin Hayes',
  'Lucas Bennett',
  'Ryan Mitchell',
  'Nathan Cole',
  'Owen Sanders',
  'Jack Foster',
  'Emma Bennett',
  'Olivia Turner',
  'Sophia Reyes',
  'Ava Mitchell',
  'Isabella Cole',
  'Mia Sanders',
  'Charlotte Foster',
  'Amelia Brooks',
  'Grace Walsh',
  'Chloe Hayes',
];

// pravatar.cc serves distinct photos for image indices 1 through 70.
const PRAVATAR_MIN_IMAGE_ID: number = 1;
const PRAVATAR_MAX_IMAGE_ID: number = 70;
const PRAVATAR_IMAGE_IDS: number[] = Array.from(
  { length: PRAVATAR_MAX_IMAGE_ID - PRAVATAR_MIN_IMAGE_ID + 1 },
  (_, index) => index + PRAVATAR_MIN_IMAGE_ID,
);

const FALLBACK_AVATAR_BACKGROUND_COLOR: string = '#6b7280';

// This avatar's host must be in the CSP img-src allowlist (server/app.ts) or the
// browser blocks it.
export const AI_PLAYER_AVATAR_URL: string =
  'https://img.magnific.com/free-vector/chatbot-chat-message-vectorart_78370-4104.jpg';

export interface SeatDisplay {
  name: string;
  avatarSrc: string;
}

function pickTwoDistinct<T>(items: T[]): [T, T] {
  const shuffled = [...items].sort(() => Math.random() - 0.5);
  const first = shuffled[0];
  const second = shuffled[1];
  if (first === undefined || second === undefined) {
    throw new Error('pickTwoDistinct requires at least two items to choose from');
  }
  return [first, second];
}

export function avatarUrl(avatarImageId: number): string {
  return `https://i.pravatar.cc/150?img=${avatarImageId}`;
}

export function fallbackAvatarUrl(name: string): string {
  const initial: string = (name.charAt(0) || '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="50" fill="${FALLBACK_AVATAR_BACKGROUND_COLOR}" />
    <text x="50" y="53" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="44" font-weight="700" fill="#ffffff">${initial}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function resolveSeatDisplay(identity: PlayerIdentity, isAiSeat: boolean): SeatDisplay {
  if (isAiSeat) {
    return { name: AI_PLAYER_NAME, avatarSrc: AI_PLAYER_AVATAR_URL };
  }
  return { name: identity.name, avatarSrc: avatarUrl(identity.avatarImageId) };
}

export function generatePlayerIdentities(): PlayerIdentities {
  const [name1, name2] = pickTwoDistinct(PLAYER_NAMES);
  const [avatarImageId1, avatarImageId2] = pickTwoDistinct(PRAVATAR_IMAGE_IDS);
  return {
    seat1: { name: name1, avatarImageId: avatarImageId1 },
    seat2: { name: name2, avatarImageId: avatarImageId2 },
  };
}
