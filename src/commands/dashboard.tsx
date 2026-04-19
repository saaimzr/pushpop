import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { render, useApp } from 'ink';
import { useEffect, useState } from 'react';
import {
  clearAssignmentsForCustomFile,
  CUSTOM_DIR,
  getConfig,
  getLifetimeCustomUploads,
  getVolume,
  HOOKS_DIR,
  setConfig,
} from '../lib/config.js';
import { playSound, resolveSoundPath } from '../lib/audio.js';
import {
  DashboardInput,
  DashboardSelect,
  DashboardView,
  type DashboardChoice,
  useTerminalColumns,
  useTerminalRows,
} from '../lib/dashboard-controls.js';
import { banner, dim, purple, statusPanel, warnColor, white } from '../lib/ui.js';
import { getAllGenres, getCustomSounds, getSoundsForGenre } from '../lib/sounds.js';
import { MAX_DURATION_SEC } from '../lib/validate.js';
import {
  FEEDBACK_EMAIL,
  FREE_TIER_LIMIT,
  POLAR_CHECKOUT_URL,
  PRICE,
  isPro,
  validateAndActivateLicense,
} from '../lib/license.js';
import { type InitNote, performInit } from './init.js';
import {
  cleanupPreparedUpload,
  type PreparedUploadSession,
  prepareUploadSession,
  previewPreparedUpload,
  savePreparedUpload,
} from './upload.js';
import { type UninstallResult, performUninstall } from './uninstall.js';
import type { SoundRef } from '../lib/config.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

type DashboardEvent = 'commit' | 'push';
type MenuChoice = 'commit' | 'push' | 'volume' | 'upload' | 'manage' | 'activate' | 'help' | 'feedback' | 'uninstall' | 'exit';
type SourceId = '__custom__' | string;

interface FlashMessage {
  tone: 'success' | 'warning' | 'info';
  message: string;
}

interface SoundItem {
  ref: SoundRef;
  label: string;
  durationSec?: number;
}

interface FilePickerRequest {
  wait: Promise<string | null>;
  cancel: () => void;
}

type Screen =
  | { kind: 'init-missing' }
  | { kind: 'init-running' }
  | { kind: 'init-result'; notes: InitNote[] }
  | { kind: 'main' }
  | { kind: 'sound-source'; event: DashboardEvent }
  | { kind: 'sound-list'; event: DashboardEvent; sourceId: SourceId; activeName?: string }
  | { kind: 'sound-confirm'; event: DashboardEvent; sourceId: SourceId; sound: SoundRef; previewBusy: boolean; previewLine: string }
  | { kind: 'volume' }
  | { kind: 'upload-method' }
  | { kind: 'upload-picker' }
  | { kind: 'upload-manual'; defaultValue?: string }
  | { kind: 'upload-preparing'; filePath: string }
  | { kind: 'upload-confirm'; session: PreparedUploadSession; feedbackLine?: string; busyAction?: 'preview' | 'save' }
  | { kind: 'upload-error'; message: string; lastPath?: string }
  | { kind: 'upload-limit'; lines: string[] }
  | { kind: 'manage-custom'; activeFile?: string }
  | { kind: 'delete-confirm'; soundFile: string }
  | { kind: 'help' }
  | { kind: 'feedback' }
  | { kind: 'activate'; defaultValue?: string }
  | { kind: 'uninstall-confirm' }
  | { kind: 'uninstall-running' }
  | { kind: 'uninstall-result'; result: UninstallResult };

const BACK_LABEL = `${purple('←')}  Back`;

function hasNativeFilePicker(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin';
}

function openFilePicker(): FilePickerRequest {
  if (!hasNativeFilePicker()) {
    return {
      wait: Promise.resolve(null),
      cancel: () => undefined,
    };
  }

  const command = process.platform === 'win32' ? 'powershell.exe' : 'osascript';
  const args = process.platform === 'win32'
    ? [
        '-NoProfile',
        '-STA',
        '-Command',
        [
          // Load WinForms and P/Invoke SetForegroundWindow to bring the dialog
          // to the foreground of the calling terminal. Without this, the
          // OpenFileDialog spawns behind the active terminal window on
          // single-monitor setups and the user has to Alt+Tab to find it.
          //
          // We use -MemberDefinition with a regular string (not a here-string)
          // because the entire command is joined into one line.
          'Add-Type -AssemblyName System.Windows.Forms;',
          `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern IntPtr GetConsoleWindow();' -Name NativeMethods -Namespace Win32;`,
          // Bring this process to the foreground so the dialog appears on top.
          '[Win32.NativeMethods]::SetForegroundWindow([Win32.NativeMethods]::GetConsoleWindow()) | Out-Null;',
          '[System.Windows.Forms.Application]::EnableVisualStyles();',
          '$dialog = New-Object System.Windows.Forms.OpenFileDialog;',
          '$dialog.Filter = "Audio files (*.mp3;*.wav;*.m4a)|*.mp3;*.wav;*.m4a";',
          '$dialog.Title = "Select audio file for pushpop";',
          '$dialog.Multiselect = $false;',
          '$dialog.RestoreDirectory = $true;',
          'try {',
          '  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.FileName }',
          '} finally {',
          '  $dialog.Dispose();',
          '}',
        ].join(' '),
      ]
    : ['-e', 'POSIX path of (choose file of type {"public.audio"} with prompt "Select audio file for pushpop")'];

  let settled = false;
  let resolveWait: (value: string | null) => void = () => undefined;
  const wait = new Promise<string | null>((resolve) => {
    resolveWait = resolve;
  });

  const finish = (value: string | null) => {
    if (settled) {
      return;
    }

    settled = true;
    resolveWait(value);
  };

  // Do NOT pass windowsHide:true — hiding the child process console window can
  // prevent the OpenFileDialog from receiving foreground activation on Windows.
  const child = execFile(command, args, { encoding: 'utf8' }, (error, stdout) => {
    if (error) {
      finish(null);
      return;
    }

    finish(stdout.trim() || null);
  });

  child.on('error', () => finish(null));

  return {
    wait,
    cancel: () => {
      if (!settled) {
        child.kill();
        finish(null);
      }
    },
  };
}

function hooksInstalled(): boolean {
  return (
    fs.existsSync(path.join(HOOKS_DIR, 'post-commit')) &&
    fs.existsSync(path.join(HOOKS_DIR, 'pre-push'))
  );
}

function getUploadLimitLines(lifetimeUploads: number, leadLine?: string): string[] {
  const lines: string[] = [];

  if (leadLine) {
    lines.push(`  ${warnColor(leadLine)}`, '');
  }

  lines.push(
    `  ${warnColor(`Custom upload limit reached (${lifetimeUploads}/${FREE_TIER_LIMIT} slots)`)}`,
    `  ${dim('Unlock unlimited for')} ${purple(PRICE)} ${dim('→')} ${dim(POLAR_CHECKOUT_URL)}`,
    `  ${dim('Then run:')} ${purple('pushpop activate <key>')}`,
  );

  return lines;
}

function getBackChoice<T>(value: T): DashboardChoice<T> {
  return { name: BACK_LABEL, value };
}

function formatAssignment(ref: SoundRef | undefined): string {
  if (!ref) return dim('— (not set)');

  const resolved = resolveSoundPath(ref);
  if (!resolved) return warnColor(`${ref.name} (file missing)`);

  return white(ref.name);
}

function compactStatusPanel(): string {
  const { assignments } = getConfig();
  const uploads = getLifetimeCustomUploads();
  const volume = getVolume();

  const rows = [
    `${dim('commit')} ${formatAssignment(assignments.commit)}  ${dim('push')} ${formatAssignment(assignments.push)}`,
    isPro()
      ? `${dim('volume')} ${white(`${volume}%`)}  ${purple('[PRO]')} ${white('unlimited uploads')}`
      : `${dim('volume')} ${white(`${volume}%`)}  ${dim('uploads')} ${white(`${uploads}/${FREE_TIER_LIMIT}`)}`,
  ];

  return statusPanel(rows.map((value, index) => ({ label: index === 0 ? 'status' : 'plan', value })));
}

function getStatusLines(): { label: string; value: string }[] {
  const { assignments } = getConfig();
  const lifetimeUploads = getLifetimeCustomUploads();
  const volume = getVolume();

  const lines: { label: string; value: string }[] = [
    { label: 'commit', value: formatAssignment(assignments.commit) },
    { label: 'push', value: formatAssignment(assignments.push) },
    { label: 'volume', value: white(`${volume}%`) },
  ];

  if (isPro()) {
    lines.push({ label: 'plan', value: `${purple('[PRO]')} ${white('unlimited custom uploads')}` });
  } else {
    lines.push({ label: 'uploads', value: white(`${lifetimeUploads}/${FREE_TIER_LIMIT} custom slots used`) });
  }

  return lines;
}

function formatFlashLine(flash: FlashMessage | null): string | undefined {
  if (!flash) return undefined;

  if (flash.tone === 'success') {
    return `  ${purple('✓')}  ${white(flash.message)}`;
  }

  if (flash.tone === 'warning') {
    return `  ${warnColor(flash.message)}`;
  }

  return `  ${purple('♪')}  ${white(flash.message)}`;
}

function getFrame(rows: number, columns: number, flash: FlashMessage | null, extraLines: string[] = []): string {
  const parts: string[] = [];

  // Render the banner inside Ink so it lives in the managed viewport and
  // recovers automatically when the terminal is widened back after being
  // collapsed. Only show it when there is enough vertical space (rows >= 18)
  // AND enough horizontal space (the banner needs ~50 columns).
  if (rows >= 18 && columns >= 50) {
    parts.push(banner(version, columns), '');
  }

  parts.push(rows < 18 ? compactStatusPanel() : statusPanel(getStatusLines()));

  const flashLine = formatFlashLine(flash);
  const bodyLines = flashLine ? [flashLine, ...extraLines] : extraLines;

  if (bodyLines.length > 0) {
    parts.push('', ...bodyLines);
  }

  return parts.join('\n');
}

function formatInitNote(note: InitNote): string {
  if (note.tone === 'success') {
    return `  ${purple('✓')}  ${white(note.message)}`;
  }

  if (note.tone === 'warning') {
    return `  ${warnColor(note.message)}`;
  }

  return `  ${dim(note.message)}`;
}

function formatUninstallStep(step: UninstallResult['steps'][number]): string {
  if (step.status === 'success') {
    return `  ${purple('✓')}  ${white(step.label)}`;
  }

  if (step.status === 'warning') {
    return `  ${warnColor(step.label)}`;
  }

  return `  ${dim(step.label)}`;
}

function getAddCustomLines(): string[] {
  if (isPro()) {
    return [`  ${purple('★')}  ${white('Pro active — unlimited custom uploads')}`];
  }

  return [`  ${dim(`Custom uploads: ${getLifetimeCustomUploads()}/${FREE_TIER_LIMIT} slots used`)}`];
}

function getSourceChoices(event: DashboardEvent): DashboardChoice<string>[] {
  const genres = getAllGenres();
  const customSounds = getCustomSounds();
  const choices: DashboardChoice<string>[] = [];

  if (customSounds.length > 0) {
    choices.push({
      name: `${purple('♫')}  ${white(`My uploads (${customSounds.length})`)}`,
      value: '__custom__',
    });
  }

  for (const genre of genres) {
    const suffix = genre.sounds.length === 0 ? dim(' (coming soon)') : '';
    choices.push({
      name: `${purple(genre.symbol)}  ${white(genre.label)}${suffix}`,
      value: genre.id,
    });
  }

  choices.push({
    name: `${purple('⌫')}  ${white('No sound (remove assignment)')}`,
    value: '__remove__',
  });
  choices.push(getBackChoice('__back__'));

  return choices;
}

function getSoundItems(sourceId: SourceId): SoundItem[] {
  if (sourceId === '__custom__') {
    return getCustomSounds().map((sound) => ({
      ref: { type: 'custom', name: sound.name, file: sound.file },
      label: sound.name,
    }));
  }

  return getSoundsForGenre(sourceId).map((sound) => ({
    ref: { type: 'builtin', name: sound.name, file: sound.file },
    label: sound.name,
    durationSec: sound.durationSec,
  }));
}

function getInitialChoiceIndex<T>(choices: DashboardChoice<T>[], activeValue?: T): number {
  if (activeValue === undefined) return 0;
  const index = choices.findIndex((choice) => choice.value === activeValue);
  return index >= 0 ? index : 0;
}

function buildUploadSummaryLines(session: PreparedUploadSession, feedbackLine?: string): string[] {
  const lines = [
    `  ${white(`Ready to save "${session.tagName}"`)}`,
    `  ${dim(`Note: Custom tags are limited to ${MAX_DURATION_SEC.toFixed(1)} seconds or less.`)}`,
    `  ${dim(`Source length: ${session.sourceDurationSec.toFixed(1)}s`)}`,
    session.wasTruncated
      ? `  ${white(`Final tag: first ${session.finalDurationSec.toFixed(1)}s will be saved`)}` 
      : `  ${dim(`Final tag length: ${session.finalDurationSec.toFixed(1)}s`)}`,
  ];

  if (feedbackLine) {
    lines.push('', feedbackLine);
  }

  return lines;
}

function InitRunningScreen(props: {
  rows: number;
  columns: number;
  flash: FlashMessage | null;
  onFinished: (notes: InitNote[]) => void;
  onError: (message: string) => void;
}) {
  const { rows, columns, flash, onFinished, onError } = props;

  useEffect(() => {
    try {
      onFinished(performInit(process.cwd()).notes);
    } catch (error: unknown) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  return (
    <DashboardView
      frame={getFrame(rows, columns, flash)}
      message={white('Setting up pushpop…')}
      lines={[`  ${dim('Installing hooks and configuring global Git hooksPath…')}`]}
      footer={dim('Please wait…')}
    />
  );
}

function SoundConfirmScreen(props: {
  rows: number;
  columns: number;
  flash: FlashMessage | null;
  screen: Extract<Screen, { kind: 'sound-confirm' }>;
  onPreviewResolved: (line: string) => void;
  onAccept: () => void;
  onBack: () => void;
}) {
  const { rows, columns, flash, screen, onPreviewResolved, onAccept, onBack } = props;

  useEffect(() => {
    if (!screen.previewBusy) {
      return;
    }

    let cancelled = false;

    const runPreview = async () => {
      try {
        const playback = await playSound(screen.sound, { mode: 'preview' });
        if (!cancelled) {
          onPreviewResolved(
            playback.started
              ? `  ${purple('♪')}  ${white(`Played: ${screen.sound.name}`)}`
              : `  ${warnColor('Preview unavailable on this system')}`,
          );
        }
      } catch {
        if (!cancelled) {
          onPreviewResolved(`  ${warnColor('Preview unavailable on this system')}`);
        }
      }
    };

    void runPreview();
    return () => {
      cancelled = true;
    };
  }, [screen.previewBusy, screen.sound]);

  return (
    <DashboardSelect
      frame={getFrame(rows, columns, flash, [screen.previewLine])}
      message={white(`Use "${screen.sound.name}" for ${purple(screen.event)}?`)}
      choices={[
        { name: white('Yes'), value: true as const },
        { name: white('No'), value: false as const },
      ]}
      onSelect={(value) => {
        if (value) {
          onAccept();
        } else {
          onBack();
        }
      }}
      onBack={onBack}
    />
  );
}

function UploadPickerScreen(props: {
  rows: number;
  columns: number;
  flash: FlashMessage | null;
  onResolved: (filePath: string | null) => void;
  onCancel: () => void;
}) {
  const { rows, columns, flash, onResolved, onCancel } = props;

  useEffect(() => {
    let cancelled = false;
    const request = openFilePicker();

    void request.wait.then((filePath) => {
      if (!cancelled) {
        onResolved(filePath);
      }
    });

    return () => {
      cancelled = true;
      request.cancel();
    };
  }, []);

  return (
    <DashboardView
      frame={getFrame(rows, columns, flash, getAddCustomLines())}
      message={white('Opening native file picker…')}
      lines={[`  ${dim('Choose an audio file to upload to pushpop.')}`]}
      footer={dim('Waiting for file selection…')}
      onBack={onCancel}
    />
  );
}

function UploadPreparingScreen(props: {
  rows: number;
  columns: number;
  flash: FlashMessage | null;
  filePath: string;
  onPrepared: (session: PreparedUploadSession) => void;
  onError: (message: string) => void;
}) {
  const { rows, columns, flash, filePath, onPrepared, onError } = props;

  useEffect(() => {
    let cancelled = false;

    const runPrepare = async () => {
      try {
        const session = await prepareUploadSession(filePath, {});
        if (!cancelled) {
          onPrepared(session);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          onError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void runPrepare();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return (
    <DashboardView
      frame={getFrame(rows, columns, flash, getAddCustomLines())}
      message={white('Preparing upload…')}
      lines={[`  ${dim(filePath)}`]}
      footer={dim('Reading audio file and trimming if needed…')}
    />
  );
}

function UploadConfirmScreen(props: {
  rows: number;
  columns: number;
  flash: FlashMessage | null;
  screen: Extract<Screen, { kind: 'upload-confirm' }>;
  onFeedback: (line: string) => void;
  onRequestPreview: () => void;
  onRequestSave: () => void;
  onSaved: (session: PreparedUploadSession) => void;
  onBack: () => void;
}) {
  const { rows, columns, flash, screen, onFeedback, onRequestPreview, onRequestSave, onSaved, onBack } = props;

  useEffect(() => {
    if (!screen.busyAction) {
      return;
    }

    let cancelled = false;

    const runAction = async () => {
      if (screen.busyAction === 'preview') {
        try {
          const started = await previewPreparedUpload(screen.session);
          if (!cancelled) {
            onFeedback(
              started
                ? `  ${purple('♪')}  ${white('Preview played.')}`
                : `  ${warnColor('Preview unavailable on this system')}`,
            );
          }
        } catch {
          if (!cancelled) {
            onFeedback(`  ${warnColor('Preview unavailable on this system')}`);
          }
        }
        return;
      }

      try {
        if (!cancelled) {
          onSaved(screen.session);
        }
      } catch {
        if (!cancelled) {
          onFeedback(`  ${warnColor('Could not save the uploaded file.')}`);
        }
      }
    };

    void runAction();
    return () => {
      cancelled = true;
    };
  }, [screen.busyAction, screen.session]);

  useEffect(() => () => cleanupPreparedUpload(screen.session), [screen.session]);

  return (
    <DashboardSelect
      frame={getFrame(rows, columns, flash, buildUploadSummaryLines(screen.session, screen.feedbackLine))}
      message={white('Choose an action:')}
      choices={[
        { name: `${purple('♪')}  ${white('Play preview')}`, value: 'preview' as const },
        { name: `${purple('✓')}  ${white('Confirm and save')}`, value: 'save' as const },
        getBackChoice('back' as const),
      ]}
      onSelect={(value) => {
        if (value === 'preview') {
          onRequestPreview();
          return;
        }

        if (value === 'save') {
          onRequestSave();
          return;
        }

        onBack();
      }}
      onBack={onBack}
    />
  );
}

function UninstallRunningScreen(props: {
  rows: number;
  columns: number;
  flash: FlashMessage | null;
  onFinished: (result: UninstallResult) => void;
}) {
  const { rows, columns, flash, onFinished } = props;

  useEffect(() => {
    onFinished(performUninstall());
  }, []);

  return (
    <DashboardView
      frame={getFrame(rows, columns, flash)}
      message={white('Uninstalling pushpop…')}
      lines={[`  ${dim('Removing hooks, config, and scheduling CLI cleanup…')}`]}
      footer={dim('Please wait…')}
    />
  );
}

function DashboardApp() {
  const { exit } = useApp();
  const rows = useTerminalRows();
  const columns = useTerminalColumns();
  const [stack, setStack] = useState<Screen[]>([{ kind: hooksInstalled() ? 'main' : 'init-missing' }]);
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const current = stack[stack.length - 1];

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timeout = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(timeout);
  }, [flash]);

  function showFlash(tone: FlashMessage['tone'], message: string): void {
    setFlash({ tone, message });
  }

  function pushScreen(screen: Screen): void {
    setStack((previous) => [...previous, screen]);
  }

  function replaceScreen(screen: Screen): void {
    setStack((previous) => [...previous.slice(0, -1), screen]);
  }

  function resetToHome(): void {
    setStack([{ kind: 'main' }]);
  }

  function goBack(): void {
    setStack((previous) => (previous.length > 1 ? previous.slice(0, -1) : previous));
  }

  switch (current.kind) {
    case 'init-missing':
      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, [
            `  ${warnColor('pushpop is not set up on this machine yet.')}`,
            `  ${dim('Hooks are missing — sounds will not play on git commit/push.')}`,
          ])}
          message={white('Run setup now?')}
          choices={[
            { name: `${purple('★')}  ${white('Run setup (pushpop init)')}`, value: 'init' as const },
            { name: `${purple('×')}  ${white('Exit')}`, value: 'exit' as const },
          ]}
          onSelect={(value) => {
            if (value === 'init') {
              replaceScreen({ kind: 'init-running' });
              return;
            }

            exit();
          }}
          onBack={() => exit()}
        />
      );

    case 'init-running':
      return (
        <InitRunningScreen
          rows={rows}
          columns={columns}
          flash={flash}
          onFinished={(notes) => {
            replaceScreen({ kind: 'init-result', notes });
          }}
          onError={(message) => {
            showFlash('warning', message);
            replaceScreen({ kind: 'init-missing' });
          }}
        />
      );

    case 'init-result':
      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, current.notes.map(formatInitNote))}
          message={white('Setup complete')}
          choices={[{ name: white('Continue'), value: 'continue' as const }]}
          onSelect={() => resetToHome()}
          onBack={() => resetToHome()}
        />
      );

    case 'main': {
      const choices: DashboardChoice<MenuChoice>[] = [
        { name: `${purple('♪')}  ${white('Set commit sound')}`, value: 'commit' },
        { name: `${purple('♫')}  ${white('Set push sound')}`, value: 'push' },
        { name: `${purple('◌')}  ${white('Set volume')}`, value: 'volume' },
        { name: `${purple('⬆')}  ${white('Add custom sound')}`, value: 'upload' },
        ...(isPro() ? [{ name: `${purple('⌫')}  ${white('Manage custom sounds')}`, value: 'manage' as const }] : []),
        { name: `${purple('★')}  ${white('Activate license')}`, value: 'activate' },
        { name: `${purple('?')}  ${white('Help / Info')}`, value: 'help' },
        { name: `${purple('✉')}  ${white('Share feedback')}`, value: 'feedback' },
        { name: `${purple('⌦')}  ${white('Uninstall')}`, value: 'uninstall' },
        { name: `${purple('×')}  ${white('Exit')}`, value: 'exit' },
      ];

      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash)}
          message={white('What do you want to do?')}
          choices={choices}
          maxPageSize={11}
          onSelect={(value) => {
            if (value === 'exit') {
              exit();
              return;
            }

            if (value === 'commit' || value === 'push') {
              pushScreen({ kind: 'sound-source', event: value });
              return;
            }

            if (value === 'volume') {
              pushScreen({ kind: 'volume' });
              return;
            }

            if (value === 'upload') {
              const lifetimeUploads = getLifetimeCustomUploads();
              if (!isPro() && lifetimeUploads >= FREE_TIER_LIMIT) {
                pushScreen({ kind: 'upload-limit', lines: getUploadLimitLines(lifetimeUploads) });
                return;
              }

              pushScreen({ kind: 'upload-method' });
              return;
            }

            if (value === 'manage') {
              pushScreen({ kind: 'manage-custom' });
              return;
            }

            if (value === 'activate') {
              pushScreen({ kind: 'activate' });
              return;
            }

            if (value === 'help') {
              pushScreen({ kind: 'help' });
              return;
            }

            if (value === 'feedback') {
              pushScreen({ kind: 'feedback' });
              return;
            }

            pushScreen({ kind: 'uninstall-confirm' });
          }}
          onBack={() => exit()}
        />
      );
    }

    case 'sound-source':
      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash)}
          message={white(`Choose a sound source for ${purple(current.event)}:`)}
          choices={getSourceChoices(current.event)}
          maxPageSize={12}
          onSelect={(value) => {
            if (value === '__back__') {
              goBack();
              return;
            }

            if (value === '__remove__') {
              const { assignments } = getConfig();
              setConfig({ assignments: { ...assignments, [current.event]: undefined } });
              showFlash('success', `Removed ${current.event} sound`);
              resetToHome();
              return;
            }

            const items = getSoundItems(value as SourceId);
            if (items.length === 0) {
              showFlash('info', 'No sounds in this pack yet — check back soon.');
              return;
            }

            pushScreen({ kind: 'sound-list', event: current.event, sourceId: value as SourceId });
          }}
          onBack={goBack}
        />
      );

    case 'sound-list': {
      const items = getSoundItems(current.sourceId);
      const choices: DashboardChoice<SoundRef | null>[] = [
        ...items.map((item) => ({ name: `  ${white(item.label)}`, value: item.ref })),
        getBackChoice(null),
      ];

      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash)}
          message={white('Choose a sound:')}
          choices={choices}
          maxPageSize={10}
          initialIndex={getInitialChoiceIndex(
            choices,
            current.activeName ? items.find((item) => item.label === current.activeName)?.ref ?? null : undefined,
          )}
          onSelect={(value) => {
            if (!value) {
              goBack();
              return;
            }

            const resolvedPath = resolveSoundPath(value);
            const previewLine = resolvedPath
              ? `  ${purple('♪')}  ${white(`Now playing: ${value.name}`)}`
              : `  ${dim('(audio file not found)')}`;

            setStack((previous) => {
              const top = previous[previous.length - 1];
              if (!top || top.kind !== 'sound-list') {
                return previous;
              }

              return [
                ...previous.slice(0, -1),
                { ...top, activeName: value.name },
                {
                  kind: 'sound-confirm',
                  event: top.event,
                  sourceId: top.sourceId,
                  sound: value,
                  previewBusy: Boolean(resolvedPath),
                  previewLine,
                },
              ];
            });
          }}
          onBack={goBack}
        />
      );
    }

    case 'sound-confirm':
      return (
        <SoundConfirmScreen
          rows={rows}
          columns={columns}
          flash={flash}
          screen={current}
          onPreviewResolved={(line) => {
            replaceScreen({ ...current, previewBusy: false, previewLine: line });
          }}
          onAccept={() => {
            const { assignments } = getConfig();
            setConfig({ assignments: { ...assignments, [current.event]: current.sound } });
            showFlash('success', `"${current.sound.name}" set for ${current.event}`);
            resetToHome();
          }}
          onBack={goBack}
        />
      );

    case 'volume': {
      const currentVolume = getVolume();
      const choices = [0, 25, 50, 75, 100].map((value) => ({
        name: `${purple(value === currentVolume ? '●' : '○')}  ${white(`${value}%`)}`,
        value,
      }));

      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash)}
          message={white('Choose a volume level:')}
          choices={[...choices, getBackChoice(-1)]}
          initialIndex={Math.max(0, choices.findIndex((choice) => choice.value === currentVolume))}
          onSelect={(value) => {
            if (value === -1) {
              goBack();
              return;
            }

            setConfig({ volume: value });
            showFlash('success', `Volume set to ${value}%`);
            resetToHome();
          }}
          onBack={goBack}
        />
      );
    }

    case 'upload-method': {
      const choices: DashboardChoice<'browse' | 'manual' | 'back'>[] = [];

      if (hasNativeFilePicker()) {
        choices.push({ name: `${purple('⬆')}  ${white('Browse for audio file')}`, value: 'browse' });
      }

      choices.push({ name: `${purple('…')}  ${white('Enter file path manually')}`, value: 'manual' });
      choices.push(getBackChoice('back'));

      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, getAddCustomLines())}
          message={white('How do you want to add a sound?')}
          choices={choices}
          onSelect={(value) => {
            if (value === 'browse') {
              pushScreen({ kind: 'upload-picker' });
              return;
            }

            if (value === 'manual') {
              pushScreen({ kind: 'upload-manual' });
              return;
            }

            goBack();
          }}
          onBack={goBack}
        />
      );
    }

    case 'upload-picker':
      return (
        <UploadPickerScreen
          rows={rows}
          columns={columns}
          flash={flash}
          onResolved={(filePath) => {
            if (!filePath) {
              showFlash('info', 'No file selected.');
              goBack();
              return;
            }

            replaceScreen({ kind: 'upload-preparing', filePath });
          }}
          onCancel={() => {
            showFlash('info', 'File picker cancelled.');
            goBack();
          }}
        />
      );

    case 'upload-manual':
      return (
        <DashboardInput
          frame={getFrame(rows, columns, flash, getAddCustomLines())}
          message={white('Path to your audio file (.mp3 / .wav / .m4a):')}
          defaultValue={current.defaultValue ?? ''}
          placeholder={dim('Paste or type a file path')}
          validate={(value) => (value.trim().length > 0 ? undefined : 'Please enter a file path')}
          onSubmit={(value) => {
            replaceScreen({ kind: 'upload-preparing', filePath: value.trim() });
          }}
          onBack={goBack}
        />
      );

    case 'upload-preparing':
      return (
        <UploadPreparingScreen
          rows={rows}
          columns={columns}
          flash={flash}
          filePath={current.filePath}
          onPrepared={(session) => {
            replaceScreen({ kind: 'upload-confirm', session });
          }}
          onError={(message) => {
            replaceScreen({ kind: 'upload-error', message, lastPath: current.filePath });
          }}
        />
      );

    case 'upload-confirm':
      return (
        <UploadConfirmScreen
          rows={rows}
          columns={columns}
          flash={flash}
          screen={current}
          onFeedback={(line) => {
            replaceScreen({ ...current, busyAction: undefined, feedbackLine: line });
          }}
          onRequestPreview={() => {
            replaceScreen({
              ...current,
              busyAction: 'preview',
              feedbackLine: `  ${purple('♪')}  ${white('Now playing preview…')}`,
            });
          }}
          onRequestSave={() => {
            replaceScreen({
              ...current,
              busyAction: 'save',
              feedbackLine: `  ${dim('Saving uploaded sound…')}`,
            });
          }}
          onSaved={(session) => {
            try {
              const result = savePreparedUpload(session);
              showFlash('success', `Saved "${session.tagName}"`);

              if (!isPro() && result.limitReached) {
                setStack([
                  { kind: 'main' },
                  {
                    kind: 'upload-limit',
                    lines: getUploadLimitLines(
                      result.uploadsUsed,
                      `All ${FREE_TIER_LIMIT} custom slots used. Next upload requires pro unlock.`,
                    ),
                  },
                ]);
                return;
              }

              resetToHome();
            } catch (error: unknown) {
              replaceScreen({
                ...current,
                busyAction: undefined,
                feedbackLine: `  ${warnColor(error instanceof Error ? error.message : String(error))}`,
              });
            }
          }}
          onBack={goBack}
        />
      );

    case 'upload-error':
      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, [...getAddCustomLines(), '', `  ${warnColor(current.message)}`])}
          message={white('Upload could not be prepared')}
          choices={[
            { name: white('Try again'), value: 'retry' as const },
            getBackChoice('back' as const),
          ]}
          onSelect={(value) => {
            if (value === 'retry') {
              if (current.lastPath) {
                replaceScreen({ kind: 'upload-manual', defaultValue: current.lastPath });
              } else {
                replaceScreen({ kind: 'upload-method' });
              }
              return;
            }

            goBack();
          }}
          onBack={goBack}
        />
      );

    case 'upload-limit':
      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, current.lines)}
          message={white('Upload limit reached')}
          choices={[{ name: white('Return'), value: 'return' as const }]}
          onSelect={() => resetToHome()}
          onBack={() => resetToHome()}
        />
      );

    case 'manage-custom': {
      const customSounds = getCustomSounds();
      const choices: DashboardChoice<string>[] = customSounds.length === 0
        ? [getBackChoice('__back__')]
        : [
            ...customSounds.map((sound) => ({
              name: `  ${white(sound.name)}`,
              value: sound.file,
            })),
            getBackChoice('__back__'),
          ];

      const extraLines = customSounds.length === 0 ? [`  ${dim('No custom sounds saved yet.')}`] : [];

      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, extraLines)}
          message={white('Choose a custom sound to delete:')}
          choices={choices}
          initialIndex={getInitialChoiceIndex(choices, current.activeFile)}
          onSelect={(value) => {
            if (value === '__back__') {
              goBack();
              return;
            }

            setStack((previous) => {
              const top = previous[previous.length - 1];
              if (!top || top.kind !== 'manage-custom') {
                return previous;
              }

              return [
                ...previous.slice(0, -1),
                { ...top, activeFile: value },
                { kind: 'delete-confirm', soundFile: value },
              ];
            });
          }}
          onBack={goBack}
        />
      );
    }

    case 'delete-confirm': {
      const sound = getCustomSounds().find((item) => item.file === current.soundFile);
      const soundName = sound?.name ?? current.soundFile;

      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, [
            `  ${warnColor(`Delete "${soundName}"?`)}`,
            `  ${dim('This removes the file and clears any commit/push assignment using it.')}`,
          ])}
          message={white('Confirm deletion:')}
          choices={[
            { name: white('Delete'), value: 'delete' as const },
            { name: white('Cancel'), value: 'cancel' as const },
          ]}
          onSelect={(value) => {
            if (value === 'cancel') {
              goBack();
              return;
            }

            try {
              const fullPath = path.join(CUSTOM_DIR, current.soundFile);
              if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
              }
              clearAssignmentsForCustomFile(current.soundFile);
              showFlash('success', `Deleted "${soundName}"`);
            } catch (error: unknown) {
              showFlash('warning', error instanceof Error ? error.message : String(error));
            }
            goBack();
          }}
          onBack={goBack}
        />
      );
    }

    case 'help':
      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, [
            `  ${white('pushpop plays short audio tags when you git commit and git push.')}`,
            '',
            `  ${dim('Run pushpop init once and it installs global git hooks through core.hooksPath.')}`,
            `  ${dim('After that, every repo on this machine works without per-project setup.')}`,
            `  ${dim('Use "Add custom sound" to browse or enter your own audio file.')}`,
            `  ${dim('Best in modern interactive terminals with ANSI/Unicode support.')}`,
            '',
            `  ${white('Upgrade to Pro:')} ${dim(POLAR_CHECKOUT_URL)}`,
            `  ${dim('Activate from the CLI with:')} ${purple('pushpop activate <key>')}`,
          ])}
          message={white('Press Enter to return.')}
          choices={[{ name: white('Return'), value: 'return' as const }]}
          onSelect={goBack}
          onBack={goBack}
        />
      );

    case 'feedback':
      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, [
            `  ${purple('✉')}  ${white('Share feedback')}`,
            '',
            `        ${purple(FEEDBACK_EMAIL)}`,
            '',
            `  ${dim('Bug reports, feature requests, producer-tag suggestions — all welcome.')}`,
          ])}
          message={white('Press Enter to return.')}
          choices={[{ name: white('Return'), value: 'return' as const }]}
          onSelect={goBack}
          onBack={goBack}
        />
      );

    case 'activate':
      return (
        <DashboardInput
          frame={getFrame(rows, columns, flash)}
          message={white('Enter your Polar license key:')}
          defaultValue={current.defaultValue ?? ''}
          pendingMessage={dim('Validating license key…')}
          validate={(value) => (value.trim().length >= 8 ? undefined : 'Key too short')}
          onSubmit={async (value) => {
            try {
              await validateAndActivateLicense(value.trim());
              showFlash('success', 'pushpop pro unlocked — unlimited custom uploads enabled');
              resetToHome();
              return;
            } catch (error: unknown) {
              return error instanceof Error ? error.message : String(error);
            }
          }}
          onBack={goBack}
        />
      );

    case 'uninstall-confirm':
      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, [
            `  ${warnColor('This removes hooks, config, and attempts to remove the global CLI.')}`,
          ])}
          message={white('Uninstall pushpop?')}
          choices={[
            { name: white('Uninstall'), value: 'uninstall' as const },
            { name: white('Cancel'), value: 'cancel' as const },
          ]}
          onSelect={(value) => {
            if (value === 'uninstall') {
              replaceScreen({ kind: 'uninstall-running' });
              return;
            }

            goBack();
          }}
          onBack={goBack}
        />
      );

    case 'uninstall-running':
      return (
        <UninstallRunningScreen
          rows={rows}
          columns={columns}
          flash={flash}
          onFinished={(result) => {
            replaceScreen({ kind: 'uninstall-result', result });
          }}
        />
      );

    case 'uninstall-result': {
      const lines = [
        `  ${purple('♪')}  ${white('Goodbye from pushpop')}`,
        `  ${dim('Thanks for shipping with us.')}`,
        '',
        ...current.result.steps.map(formatUninstallStep),
        '',
        current.result.spawned
          ? `  ${dim('The pushpop command will disappear from your PATH in a moment.')}`
          : `  ${dim(`Run this to remove the pushpop binary: ${current.result.manualCommand}`)}`,
      ];

      return (
        <DashboardSelect
          frame={getFrame(rows, columns, flash, lines)}
          message={white('Uninstall complete')}
          choices={[{ name: white('Exit pushpop'), value: 'exit' as const }]}
          onSelect={() => exit()}
          onBack={() => exit()}
        />
      );
    }

    default:
      return null;
  }
}

export async function runDashboard(): Promise<void> {
  // The banner is now rendered inside the Ink component tree (via getFrame)
  // so it redraws reactively on terminal resize. We no longer print it here
  // to avoid a duplicate static copy in the scrollback.
  console.log('');

  const instance = render(<DashboardApp />, {
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    exitOnCtrlC: true,
    patchConsole: true,
  });

  await instance.waitUntilExit();
  console.log('');
}
