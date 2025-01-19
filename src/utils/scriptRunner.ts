import { exec } from 'child_process';

/**
 * Runs a TypeScript script using `ts-node`.
 * @param scriptPath - The relative path to the script.
 * @param args - An array of arguments to pass to the script.
 * @returns A promise that resolves to the script's output or rejects with an error.
 */

export const runScript = (scriptPath: string, args: string[] = []): Promise<string> => {
  return new Promise((resolve, reject) => {
    const command = `ts-node ${scriptPath} ${args.join(' ')}`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(stderr);
      }
      resolve(stdout ? stdout : stderr);
    });
  });
}