/**
 * Kills leftover *project* dev processes (`tsx`/`node`/`vite`) still listening on this
 * project's dev ports (server 3000, client 5173) so `pnpm run dev` doesn't fail with
 * "address already in use". A `tsx watch` or `vite` process from a previous session that
 * never stopped is the usual cause — see the README's Troubleshooting section.
 *
 * Deliberately does NOT kill anything it can't identify as this project's own dev
 * process — in particular never Docker's own process (`com.docker.backend` on macOS is
 * what actually publishes a container's port on the host; killing it takes down the
 * whole Docker Desktop VM, not just one container). If port 3000 is held by a
 * `dices-game-app-1` container, the fix is `docker compose down`, not killing a host PID.
 *
 * Usage: pnpm run free-ports
 */
import { execSync } from 'node:child_process';

const SERVER_PORT: number = 3000;
const CLIENT_PORT: number = 5173;
const PORTS_TO_FREE: readonly number[] = [SERVER_PORT, CLIENT_PORT];

// Command names this project's own dev processes actually run under — see
// package.json's "dev:server" (tsx) and "dev:client" (vite runs as a node child process).
const KILLABLE_COMMAND_PATTERN: RegExp = /^(node|tsx)$/i;

interface ListeningProcess {
  processId: string;
  command: string;
}

function findListeningProcesses(port: number): ListeningProcess[] {
  if (process.platform === 'win32') {
    return findListeningProcessesOnWindows(port);
  }
  return findListeningProcessesOnUnix(port);
}

function findListeningProcessesOnUnix(port: number): ListeningProcess[] {
  try {
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -F pc`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    return parseLsofFieldOutput(output);
  } catch {
    // lsof exits non-zero when nothing is listening on the port — not an error, just "free".
    return [];
  }
}

// `-F pc` prints one field per line: `p<pid>` then `c<command>`, repeated per match.
function parseLsofFieldOutput(output: string): ListeningProcess[] {
  const processes: ListeningProcess[] = [];
  let currentProcessId: string | undefined;
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) {
      currentProcessId = line.slice(1);
    } else if (line.startsWith('c') && currentProcessId !== undefined) {
      processes.push({ processId: currentProcessId, command: line.slice(1) });
      currentProcessId = undefined;
    }
  }
  return processes;
}

function findListeningProcessesOnWindows(port: number): ListeningProcess[] {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    const processIds = new Set<string>();
    for (const line of output.split('\n')) {
      const match = line.trim().match(/LISTENING\s+(\d+)$/);
      if (match) {
        processIds.add(match[1]);
      }
    }
    return [...processIds].map((processId) => ({
      processId,
      command: getWindowsProcessCommand(processId),
    }));
  } catch {
    return [];
  }
}

function getWindowsProcessCommand(processId: string): string {
  try {
    const output = execSync(`tasklist /FI "PID eq ${processId}" /FO CSV /NH`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    return output.split(',')[0]?.replace(/^"|"$/g, '') ?? '';
  } catch {
    return '';
  }
}

function killProcess(processId: string): void {
  const killCommand =
    process.platform === 'win32' ? `taskkill /F /PID ${processId}` : `kill ${processId}`;
  execSync(killCommand, { stdio: 'ignore' });
}

function freePort(port: number): void {
  const listeningProcesses = findListeningProcesses(port);
  if (listeningProcesses.length === 0) {
    console.log(`Port ${port} is already free.`);
    return;
  }
  for (const listeningProcess of listeningProcesses) {
    freeListeningProcess(port, listeningProcess);
  }
}

function freeListeningProcess(port: number, listeningProcess: ListeningProcess): void {
  const { processId, command } = listeningProcess;
  if (!KILLABLE_COMMAND_PATTERN.test(command)) {
    console.log(
      `Port ${port} is held by "${command}" (PID ${processId}) — not a project dev process, ` +
        `leaving it alone. If this is a Docker container, run "docker compose down" instead.`,
    );
    return;
  }
  killProcess(processId);
  console.log(`Killed "${command}" (PID ${processId}) holding port ${port}.`);
}

for (const port of PORTS_TO_FREE) {
  freePort(port);
}
