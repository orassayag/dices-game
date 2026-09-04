// Real screens (LoginScreen, GameScreen) land at M4 (master stages 7-8) — this
// placeholder just confirms the M0 Tailwind + build pipeline renders.
export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <p className="text-sm text-slate-400">Dice game — foundation stage. UI lands at M4.</p>
    </main>
  );
}
