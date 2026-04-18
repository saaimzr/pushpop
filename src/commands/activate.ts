import ora from 'ora';
import { validateAndActivateLicense } from '../lib/license.js';
import { ok, purple } from '../lib/ui.js';
//test1123
export async function runActivate(
  key: string,
  options: { exitOnError?: boolean } = {},
): Promise<void> {
  const { exitOnError = true } = options;
  const spinner = ora({ text: 'Validating license key...', color: 'magenta' }).start();

  try {
    await validateAndActivateLicense(key);
    spinner.succeed('License validated');
    console.log('');
    ok('pushpop pro unlocked — unlimited custom uploads enabled');
    console.log(`\n  ${purple('♪')}  Drop your sounds. No limits.\n`);
  } catch (error: unknown) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    if (exitOnError) {
      process.exit(1);
    }
    throw error;
  }
}
