export interface PlayerIdentity {
  name: string;
  avatarImageId: number;
}

export interface PlayerIdentities {
  seat1: PlayerIdentity;
  seat2: PlayerIdentity;
}

// Display names only — the avatar photo is now picked independently as a random
// pravatar.cc image index (§8), not paired to a specific name.
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

// §4: the AI opponent always shows this fixed identity, never a random human one — the
// CSP img-src allowlist (server/app.ts) must include this host or the browser blocks it.
export const AI_PLAYER_NAME: string = 'AI Dices BOT';
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

/** A real face photo at the given pravatar.cc index (see avatars.txt). `avatarImageId`
 * is that service's own photo index, not a local asset. */
export function avatarUrl(avatarImageId: number): string {
  return `https://i.pravatar.cc/150?img=${avatarImageId}`;
}

/** Fallback shown if the network photo fails to load (offline, blocked host) — a
 * self-contained colored initial circle so the UI never shows a broken-image glyph. */
export function fallbackAvatarUrl(name: string): string {
  const initial: string = (name.charAt(0) || '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="50" fill="${FALLBACK_AVATAR_BACKGROUND_COLOR}" />
    <text x="50" y="53" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="44" font-weight="700" fill="#ffffff">${initial}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Resolves what a seat actually shows: the fixed AI bot identity while that seat is
 * played by the AI, otherwise the seat's own human identity. `identity` is never mutated
 * when a seat becomes/stops being AI (GameScreen generates it once per session), so
 * switching a New Game's opponent back to "Human" shows the exact same player as before
 * with no separate "restore" step needed. */
export function resolveSeatDisplay(identity: PlayerIdentity, isAiSeat: boolean): SeatDisplay {
  if (isAiSeat) {
    return { name: AI_PLAYER_NAME, avatarSrc: AI_PLAYER_AVATAR_URL };
  }
  return { name: identity.name, avatarSrc: avatarUrl(identity.avatarImageId) };
}

/** Random name + random avatar photo per seat, generated once per browser session (see
 * GameScreen's `useState(() => generatePlayerIdentities())`) so identities stay fixed for
 * as long as the user is signed in — never reshuffled by editing the New Game modal or by
 * creating additional games. */
export function generatePlayerIdentities(): PlayerIdentities {
  const [name1, name2] = pickTwoDistinct(PLAYER_NAMES);
  const [avatarImageId1, avatarImageId2] = pickTwoDistinct(PRAVATAR_IMAGE_IDS);
  return {
    seat1: { name: name1, avatarImageId: avatarImageId1 },
    seat2: { name: name2, avatarImageId: avatarImageId2 },
  };
}
