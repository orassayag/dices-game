import { createApp } from '../server/app.js';

// Vercel serverless entry point. Reuses the same Express app the standalone server
// (server/index.ts) runs — the only difference is Vercel invokes it per-request instead
// of us calling app.listen(). vercel.json rewrites /auth, /games and /health here.
const app = createApp();

export default app;
