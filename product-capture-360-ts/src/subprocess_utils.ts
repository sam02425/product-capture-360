import { spawn, ChildProcess } from 'child_process';
import { logger } from './logger';

/**
 * Subprocess Utilities
 *
 * Helper functions for managing Python subprocesses with timeouts and proper cleanup
 */

export interface SpawnWithTimeoutOptions {
  command: string;
  args: string[];
  timeout?: number; // milliseconds
  description?: string;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Spawn a subprocess with automatic timeout and cleanup
 */
export function spawnWithTimeout(options: SpawnWithTimeoutOptions): Promise<SpawnResult> {
  const {
    command,
    args,
    timeout = 30000, // 30 second default
    description = 'subprocess'
  } = options;

  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn(command, args);
    let stdout = '';
    let stderr = '';
    let isTimedOut = false;
    let isResolved = false;

    // Set timeout
    const timeoutId = setTimeout(() => {
      if (isResolved) return;

      isTimedOut = true;
      logger.warn(`Subprocess timeout: ${description}`, {
        command,
        timeout
      });

      // Kill the process
      if (proc.pid) {
        try {
          process.kill(proc.pid, 'SIGKILL');
        } catch (error) {
          logger.error('Failed to kill timed-out process', {
            pid: proc.pid
          }, { error: (error as Error).message });
        }
      }

      isResolved = true;
      reject(new Error(`Subprocess timed out after ${timeout}ms: ${description}`));
    }, timeout);

    // Collect stdout
    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    // Collect stderr
    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    // Handle process exit
    proc.on('close', (code) => {
      if (isResolved) return;

      clearTimeout(timeoutId);
      isResolved = true;

      if (isTimedOut) {
        return; // Already rejected due to timeout
      }

      resolve({
        stdout,
        stderr,
        exitCode: code
      });
    });

    // Handle process errors
    proc.on('error', (error) => {
      if (isResolved) return;

      clearTimeout(timeoutId);
      isResolved = true;

      logger.error(`Subprocess error: ${description}`, {
        command
      }, { error: error.message });

      reject(error);
    });
  });
}

/**
 * Run a Python script with timeout
 */
export async function runPythonScript(
  scriptPath: string,
  args: string[],
  timeout?: number,
  description?: string
): Promise<SpawnResult> {
  return spawnWithTimeout({
    command: 'python3',
    args: [scriptPath, ...args],
    timeout,
    description: description || `python: ${scriptPath}`
  });
}

/**
 * Parse JSON from subprocess output
 */
export function parseSubprocessJSON<T>(stdout: string, description: string): T {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    logger.error(`Failed to parse subprocess JSON: ${description}`, {}, {
      stdout: stdout.substring(0, 500),
      error: (error as Error).message
    });
    throw new Error(`Failed to parse ${description} output as JSON`);
  }
}
