import {
  createPrompt,
  useEffect,
  useKeypress,
  useState,
  isBackspaceKey,
  isDownKey,
  isEnterKey,
  isUpKey,
} from '@inquirer/core';
import chalk from 'chalk';
import { exitClean } from './ui.js';

const P = chalk.hex('#9B59B6');
const W = chalk.white;
const DIM = chalk.dim;
const ERR = chalk.red;
const NAV_BACK_INPUT = '__nav_back__';

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

function getDefaultHelpText(kind: 'select' | 'input'): string {
  if (kind === 'input') {
    return 'Esc back  Type to edit  Enter submit';
  }

  return 'Left back  Up/Down navigate  Right or Enter select';
}

function getHelpText(config: FrameConfig, kind: 'select' | 'input'): string {
  return config.helpText ?? getDefaultHelpText(kind);
}

function renderFrame(config: FrameConfig, body: string[], kind: 'select' | 'input'): string {
  return [config.frame, W(config.message), ...body, DIM(getHelpText(config, kind))]
    .filter((line) => line && line.length > 0)
    .join('\n');
}

function renderInputPrompt(config: FrameConfig, inputLine: string, errorMsg?: string): [string, string] {
  const content = [config.frame, W(config.message), inputLine]
    .filter((line) => line && line.length > 0)
    .join('\n');
  const bottom = [errorMsg ? ERR(errorMsg) : undefined, DIM(getHelpText(config, 'input'))]
    .filter((line) => line && line.length > 0)
    .join('\n');
  return [content, bottom];
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

    return renderFrame(config, lines, 'select');
  },
);

interface InputConfig extends FrameConfig {
  defaultValue?: string;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}

const _inputPrompt = createPrompt<string, InputConfig>((config, done) => {
  const [value, setValue] = useState(config.defaultValue ?? '');
  const [errorMsg, setError] = useState<string>();

  useEffect((rl) => {
    if (config.defaultValue) {
      rl.write(config.defaultValue);
    }
  }, []);

  useKeypress(async (key, rl) => {
    if (key.name === 'c' && key.ctrl) {
      exitClean(0);
    } else if (key.name === 'escape') {
      done(NAV_BACK_INPUT);
      return;
    }

    if (isEnterKey(key)) {
      const nextValue = rl.line;
      const outcome = config.validate ? await config.validate(nextValue) : true;
      if (outcome === true) {
        done(nextValue);
        return;
      }

      rl.write(nextValue);
      setError(typeof outcome === 'string' ? outcome : 'Please enter a valid value');
      setValue(nextValue);
      return;
    }

    if (isBackspaceKey(key) && !rl.line) {
      setValue('');
      setError(undefined);
      return;
    }

    setValue(rl.line);
    setError(undefined);
  });

  const body = `${P('>')} ${value}`;
  return renderInputPrompt(config, body, errorMsg);
});

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

export async function navInput(config: {
  frame?: string;
  message: string;
  defaultValue?: string;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
  helpText?: string;
}): Promise<string | typeof NAV_BACK> {
  const result = await _inputPrompt(config, { clearPromptOnDone: true });
  return result === NAV_BACK_INPUT ? NAV_BACK : result;
}
