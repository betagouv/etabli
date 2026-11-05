import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';

import { sleep } from '@etabli/src/utils/sleep';

const displayName = ':99';

// A firewall challenge is far more likely to pass with a visible browser, so on a machine without screen we provide a virtual one.
// It returns a function to release it, or `null` if `Xvfb` is not available (the browser must then be headless)
export async function startVirtualDisplay(): Promise<(() => void) | null> {
  if (process.env.DISPLAY) {
    return () => {};
  }

  const xvfb: ChildProcess = spawn('Xvfb', [displayName, '-screen', '0', '1440x900x24', '-nolisten', 'tcp'], { stdio: 'ignore' });

  const isRunning = await new Promise<boolean>((resolve) => {
    xvfb.once('error', () => resolve(false));
    xvfb.once('exit', () => resolve(false));
    sleep(500).then(() => resolve(true));
  });

  if (!isRunning) {
    // Another run (or one that did not stop properly) may already provide it, it can be shared
    if (existsSync(`/tmp/.X11-unix/X${displayName.slice(1)}`)) {
      process.env.DISPLAY = displayName;

      return () => {
        delete process.env.DISPLAY;
      };
    }

    console.warn(`no virtual display available, the browser will be headless`);

    return null;
  }

  process.env.DISPLAY = displayName;

  return () => {
    delete process.env.DISPLAY;
    xvfb.kill();
  };
}
