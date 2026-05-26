import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOutputMode, output, error } from '../src/output.js';

describe('getOutputMode', () => {
  it('returns "text" by default', () => {
    expect(getOutputMode({})).toBe('text');
  });

  it('returns "json" when --json is set', () => {
    expect(getOutputMode({ json: true })).toBe('json');
  });

  it('returns "quiet" when --quiet is set', () => {
    expect(getOutputMode({ quiet: true })).toBe('quiet');
  });

  it('prefers --quiet over --json', () => {
    expect(getOutputMode({ json: true, quiet: true })).toBe('quiet');
  });
});

describe('output', () => {
  let stdoutWrite: vi.SpyInstance;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
  });

  it('prints text mode output', () => {
    output('hello world', {});
    expect(stdoutWrite).toHaveBeenCalledWith('hello world\n');
  });

  it('prints JSON for objects in text mode', () => {
    output({ key: 'value' }, {});
    expect(stdoutWrite).toHaveBeenCalledWith(JSON.stringify({ key: 'value' }, null, 2) + '\n');
  });

  it('prints JSON mode output', () => {
    output({ key: 'value' }, { json: true });
    expect(stdoutWrite).toHaveBeenCalledWith(JSON.stringify({ key: 'value' }, null, 2) + '\n');
  });

  it('prints string as JSON in json mode', () => {
    output('hello', { json: true });
    expect(stdoutWrite).toHaveBeenCalledWith(JSON.stringify('hello', null, 2) + '\n');
  });

  it('suppresses output in quiet mode', () => {
    output('should not appear', { quiet: true });
    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});

describe('error', () => {
  let stderrWrite: vi.SpyInstance;

  beforeEach(() => {
    stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stderrWrite.mockRestore();
  });

  it('prints to stderr with "Error: " prefix', () => {
    error('something failed');
    expect(stderrWrite).toHaveBeenCalledWith('Error: something failed\n');
  });
});
