import ora from 'ora';
import { validateAndActivateLicense } from '../lib/license.js';
import { ok, fail, purple } from '../lib/ui.js';

export async function runActivate(key: string): Promise<void> {
  const spinner = ora({ text: 'Validating license key...', color: 'magenta' }).start();

  try {
    await validateAndActivateLicense(key);
    spinner.succeed('License validated');
    console.log('');
    ok('pushpop pro unlocked — unlimited custom uploads enabled');
    console.log(`\n  ${purple('♪')}  Drop your sounds. No limits.\n`);
  } catch (e: unknown) {
    spinner.fail(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
