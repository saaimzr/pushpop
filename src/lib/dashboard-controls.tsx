import { Text, useInput, useStdout } from 'ink';
import { useEffect, useState } from 'react';
import { dim, purple, warnColor } from './ui.js';

export interface DashboardChoice<T> {
  name: string;
  value: T;
}

interface DashboardSelectProps<T> {
  frame?: string;
  message: string;
  choices: DashboardChoice<T>[];
  onSelect: (value: T) => void;
  onBack?: () => void;
  helpText?: string;
  maxPageSize?: number;
  initialIndex?: number;
}

interface DashboardInputProps {
  frame?: string;
  message: string;
  defaultValue?: string;
  onSubmit: (value: string) => Promise<string | void> | string | void;
  onBack?: () => void;
  helpText?: string;
  pendingMessage?: string;
  placeholder?: string;
  validate?: (value: string) => Promise<string | void> | string | void;
}

interface DashboardViewProps {
  frame?: string;
  message: string;
  lines?: string[];
  footer?: string;
}

const SELECT_HELP = '← back  ↑↓ navigate  → or Enter select';
const INPUT_HELP = 'Esc or Left back  Type to edit  Enter submit';

function countLines(value?: string): number {
  return value ? value.split('\n').length : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useTerminalRows(): number {
  const { stdout } = useStdout();
  const [rows, setRows] = useState(stdout.rows ?? process.stdout.rows ?? 24);

  useEffect(() => {
    const handleResize = () => {
      setRows(stdout.rows ?? process.stdout.rows ?? 24);
    };

    handleResize();
    stdout.on('resize', handleResize);
    return () => {
      stdout.removeListener('resize', handleResize);
    };
  }, [stdout]);

  return rows;
}

export function DashboardSelect<T>({
  frame,
  message,
  choices,
  onSelect,
  onBack,
  helpText = SELECT_HELP,
  maxPageSize,
  initialIndex = 0,
}: DashboardSelectProps<T>) {
  const [active, setActive] = useState(() =>
    choices.length === 0 ? 0 : clamp(initialIndex, 0, choices.length - 1),
  );
  const rows = useTerminalRows();

  useEffect(() => {
    setActive((current) => {
      if (choices.length === 0) return 0;
      const preferred = clamp(initialIndex, 0, choices.length - 1);
      return current >= choices.length ? preferred : current;
    });
  }, [choices.length, initialIndex]);

  useInput((input, key) => {
    if (choices.length === 0) {
      if ((key.escape || key.leftArrow) && onBack) {
        onBack();
      }
      return;
    }

    if (key.upArrow) {
      setActive((current) => clamp(current - 1, 0, choices.length - 1));
      return;
    }

    if (key.downArrow) {
      setActive((current) => clamp(current + 1, 0, choices.length - 1));
      return;
    }

    if (key.pageUp) {
      setActive((current) => clamp(current - 5, 0, choices.length - 1));
      return;
    }

    if (key.pageDown) {
      setActive((current) => clamp(current + 5, 0, choices.length - 1));
      return;
    }

    if (key.home) {
      setActive(0);
      return;
    }

    if (key.end) {
      setActive(choices.length - 1);
      return;
    }

    if (key.return || key.rightArrow) {
      onSelect(choices[active].value);
      return;
    }

    if ((key.escape || key.leftArrow) && onBack) {
      onBack();
      return;
    }

    if (input === 'k') {
      setActive((current) => clamp(current - 1, 0, choices.length - 1));
      return;
    }

    if (input === 'j') {
      setActive((current) => clamp(current + 1, 0, choices.length - 1));
    }
  });

  const reservedLines = countLines(frame) + 3;
  const rawPageSize = rows - reservedLines;
  const pageSize = clamp(
    Math.min(maxPageSize ?? choices.length, choices.length || 1),
    1,
    Math.max(1, rawPageSize),
  );
  const start = Math.max(
    0,
    Math.min(active - Math.floor(pageSize / 2), Math.max(0, choices.length - pageSize)),
  );
  const end = Math.min(start + pageSize, choices.length);
  const renderedChoices = choices.slice(start, end).map((choice, index) => {
    const isActive = start + index === active;
    return `${isActive ? purple('>') : ' '}  ${choice.name}`;
  });

  return (
    <Text>
      {[frame, message, ...renderedChoices, dim(helpText)]
        .filter((line) => typeof line === 'string' && line.length > 0)
        .join('\n')}
    </Text>
  );
}

export function DashboardInput({
  frame,
  message,
  defaultValue = '',
  onSubmit,
  onBack,
  helpText = INPUT_HELP,
  pendingMessage = dim('Submitting…'),
  placeholder,
  validate,
}: DashboardInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useInput(async (input, key) => {
    if (submitting) {
      return;
    }

    if ((key.escape || key.leftArrow) && onBack) {
      onBack();
      return;
    }

    if (key.return) {
      const validationError = await validate?.(value);
      if (validationError) {
        setError(validationError);
        return;
      }

      setSubmitting(true);
      try {
        const submitError = await onSubmit(value);
        if (submitError) {
          setError(submitError);
        } else {
          setError(undefined);
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1));
      setError(undefined);
      return;
    }

    if (key.ctrl || key.meta || key.tab) {
      return;
    }

    if (input.length > 0) {
      setValue((current) => current + input);
      setError(undefined);
    }
  });

  const promptValue = value.length > 0 ? value : (placeholder ? dim(placeholder) : '');
  const footer = submitting ? pendingMessage : dim(helpText);

  return (
    <Text>
      {[frame, message, `${purple('>')} ${promptValue}`, error ? warnColor(error) : undefined, footer]
        .filter((line) => typeof line === 'string' && line.length > 0)
        .join('\n')}
    </Text>
  );
}

export function DashboardView({ frame, message, lines = [], footer }: DashboardViewProps) {
  return (
    <Text>
      {[frame, message, ...lines, footer]
        .filter((line) => typeof line === 'string' && line.length > 0)
        .join('\n')}
    </Text>
  );
}
