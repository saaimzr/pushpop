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
import { clearScreen, exitClean } from './ui.js';

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

interface FrameViewport {
  availableRows: number;
  canScroll: boolean;
  content?: string;
  maxOffset: number;
  offset: number;
}

function getTerminalRows(): number {
  return Math.max(process.stdout.rows ?? 24, 8);
}

function getFrameViewport(frame: string | undefined, reservedRows: number, requestedOffset: number): FrameViewport {
  if (!frame) {
    return {
      availableRows: 0,
      canScroll: false,
      content: undefined,
      maxOffset: 0,
      offset: 0,
    };
  }

  const frameLines = frame.split('\n');
  const availableRows = Math.max(0, getTerminalRows() - reservedRows);

  if (frameLines.length <= availableRows) {
    return {
      availableRows,
      canScroll: false,
      content: frame,
      maxOffset: 0,
      offset: 0,
    };
  }

  const maxOffset = Math.max(0, frameLines.length - availableRows);
  const offset = Math.max(0, Math.min(requestedOffset, maxOffset));
  const content = availableRows > 0 ? frameLines.slice(offset, offset + availableRows).join('\n') : undefined;

  return {
    availableRows,
    canScroll: true,
    content,
    maxOffset,
    offset,
  };
}

function getDefaultHelpText(kind: 'select' | 'input'): string {
  if (kind === 'input') {
    return 'Esc back  Type to edit  Enter submit';
  }

  return 'Left back  Up/Down navigate  Right or Enter select';
}

function getHelpText(config: FrameConfig, viewport: FrameViewport, kind: 'select' | 'input'): string {
  const base = config.helpText ?? getDefaultHelpText(kind);

  if (!viewport.canScroll) {
    return base;
  }

  return `${base}  PgUp/PgDn or Ctrl+U/Ctrl+D scroll header`;
}

function renderFrame(
  config: FrameConfig,
  body: string[],
  viewport: FrameViewport,
  kind: 'select' | 'input',
): string {
  return [viewport.content, W(config.message), ...body, DIM(getHelpText(config, viewport, kind))]
    .filter((line) => line && line.length > 0)
    .join('\n');
}

function renderInputPrompt(
  config: FrameConfig,
  inputLine: string,
  viewport: FrameViewport,
  errorMsg?: string,
): [string, string] {
  const content = [viewport.content, W(config.message), inputLine]
    .filter((line) => line && line.length > 0)
    .join('\n');
  const bottom = [errorMsg ? ERR(errorMsg) : undefined, DIM(getHelpText(config, viewport, 'input'))]
    .filter((line) => line && line.length > 0)
    .join('\n');
  return [content, bottom];
}

function getScrollStep(viewport: FrameViewport): number {
  return Math.max(1, Math.floor(Math.max(1, viewport.availableRows) / 2));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _selectPrompt = createPrompt<unknown, FrameConfig & { choices: NavChoice<any>[]; pageSize?: number }>(
  (config, done) => {
    const [active, setActive] = useState(0);
    const choices = config.choices;
    const maxChoiceRows = Math.max(1, getTerminalRows() - 2);
    const pageSize = Math.max(1, Math.min(config.pageSize ?? 10, maxChoiceRows));
    const initialViewport = getFrameViewport(config.frame, 1 + pageSize + 1, 0);
    const [frameOffset, setFrameOffset] = useState(initialViewport.maxOffset);

    useKeypress((key) => {
      const viewport = getFrameViewport(config.frame, 1 + pageSize + 1, frameOffset);
      const scrollStep = getScrollStep(viewport);

      if (key.name === 'c' && key.ctrl) {
        exitClean(0);
      } else if (key.name === 'pageup' || (key.name === 'u' && key.ctrl)) {
        setFrameOffset(Math.max(0, viewport.offset - scrollStep));
      } else if (key.name === 'pagedown' || (key.name === 'd' && key.ctrl)) {
        setFrameOffset(Math.min(viewport.maxOffset, viewport.offset + scrollStep));
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

    const viewport = getFrameViewport(config.frame, 1 + lines.length + 1, frameOffset);
    return renderFrame(config, lines, viewport, 'select');
  },
);

interface InputConfig extends FrameConfig {
  defaultValue?: string;
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}

const _inputPrompt = createPrompt<string, InputConfig>((config, done) => {
  const [value, setValue] = useState(config.defaultValue ?? '');
  const [errorMsg, setError] = useState<string>();
  const initialViewport = getFrameViewport(config.frame, 1 + 1 + 1, 0);
  const [frameOffset, setFrameOffset] = useState(initialViewport.maxOffset);

  useEffect((rl) => {
    if (config.defaultValue) {
      rl.write(config.defaultValue);
    }
  }, []);

  useKeypress(async (key, rl) => {
    const viewport = getFrameViewport(config.frame, 1 + 1 + 1 + (errorMsg ? 1 : 0), frameOffset);
    const scrollStep = getScrollStep(viewport);

    if (key.name === 'c' && key.ctrl) {
      exitClean(0);
    } else if (key.name === 'pageup' || (key.name === 'u' && key.ctrl)) {
      setFrameOffset(Math.max(0, viewport.offset - scrollStep));
      return;
    } else if (key.name === 'pagedown' || (key.name === 'd' && key.ctrl)) {
      setFrameOffset(Math.min(viewport.maxOffset, viewport.offset + scrollStep));
      return;
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

  const body = [`${P('>')} ${value}`];
  const viewport = getFrameViewport(config.frame, 1 + body.length + 1 + (errorMsg ? 1 : 0), frameOffset);
  return renderInputPrompt(config, body[0], viewport, errorMsg);
});

export async function navSelect<T>(config: {
  frame?: string;
  message: string;
  choices: NavChoice<T>[];
  pageSize?: number;
  helpText?: string;
}): Promise<T | typeof NAV_BACK> {
  clearScreen();
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
  clearScreen();
  const result = await _inputPrompt(config, { clearPromptOnDone: true });
  return result === NAV_BACK_INPUT ? NAV_BACK : result;
}
