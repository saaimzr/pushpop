import { createPrompt, useState, useKeypress, isEnterKey, isUpKey, isDownKey } from '@inquirer/core';
import chalk from 'chalk';

const P = chalk.hex('#9B59B6');
const W = chalk.white;
const DIM = chalk.dim;

export const NAV_BACK = Symbol('nav-back');

export interface NavChoice<T> {
  name: string;
  value: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _prompt = createPrompt<unknown, { message: string; choices: NavChoice<any>[]; pageSize?: number }>(
  (config, done) => {
    const [active, setActive] = useState(0);
    const choices = config.choices;
    const pageSize = config.pageSize ?? 10;

    useKeypress((key) => {
      if (isEnterKey(key) || key.name === 'right') {
        done(choices[active].value);
      } else if (isUpKey(key)) {
        setActive(Math.max(0, active - 1));
      } else if (isDownKey(key)) {
        setActive(Math.min(choices.length - 1, active + 1));
      } else if (key.name === 'left') {
        done(NAV_BACK);
      }
    });

    const start = Math.max(0, Math.min(active - Math.floor(pageSize / 2), choices.length - pageSize));
    const end = Math.min(start + pageSize, choices.length);
    const visible = choices.slice(start, end);

    const lines = visible.map((choice, i) => {
      const isActive = (start + i) === active;
      return `${isActive ? P('❯') : ' '}  ${choice.name}`;
    });

    return [
      W(config.message),
      ...lines,
      DIM('← back  ↑↓ navigate  → or ⏎ select'),
    ].join('\n');
  }
);

export async function navSelect<T>(config: {
  message: string;
  choices: NavChoice<T>[];
  pageSize?: number;
}): Promise<T | typeof NAV_BACK> {
  const result = await _prompt(config, { clearPromptOnDone: true });
  return result as T | typeof NAV_BACK;
}
