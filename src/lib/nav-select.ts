import {
  createPrompt,
  useKeypress,
  useState,
  isDownKey,
  isEnterKey,
  isUpKey,
} from '@inquirer/core';
import chalk from 'chalk';
import { exitClean } from './ui.js';

const P = chalk.hex('#9B59B6');
const W = chalk.white;
const DIM = chalk.dim;

export const NAV_BACK = Symbol('nav-back');

export interface NavChoice<T> {
  name: string;
  value: T;
}

interface FrameConfig {
  frame?: string;
  message: string;
  helpText?: string;
}

function getHelpText(config: FrameConfig): string {
  return config.helpText ?? 'Left back  Up/Down navigate  Right or Enter select';
}

function renderFrame(config: FrameConfig, body: string[]): string {
  return [config.frame, W(config.message), ...body, DIM(getHelpText(config))]
    .filter((line) => line && line.length > 0)
    .join('\n');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _selectPrompt = createPrompt<unknown, FrameConfig & { choices: NavChoice<any>[]; pageSize?: number }>(
  (config, done) => {
    const [active, setActive] = useState(0);
    const choices = config.choices;
    const pageSize = Math.max(1, config.pageSize ?? 10);

    useKeypress((key) => {
      if (key.name === 'c' && key.ctrl) {
        exitClean(0);
      } else if (isEnterKey(key) || key.name === 'right') {
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
    const lines = visible.map((choice, index) => {
      const isActive = start + index === active;
      return `${isActive ? P('>') : ' '}  ${choice.name}`;
    });

    return renderFrame(config, lines);
  },
);

export async function navSelect<T>(config: {
  frame?: string;
  message: string;
  choices: NavChoice<T>[];
  pageSize?: number;
  helpText?: string;
}): Promise<T | typeof NAV_BACK> {
  const result = await _selectPrompt(config, { clearPromptOnDone: true });
  return result as T | typeof NAV_BACK;
}
