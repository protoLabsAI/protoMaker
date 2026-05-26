import { describe, it, expect } from 'vitest';
import { DiskPressureCheck } from '@/services/maintenance/checks/disk-pressure-check.js';

/** Build a statfs result with the given used percentage. */
function statfsAtUsedPct(usedPct: number) {
  const blocks = 1000;
  const bavail = Math.round(blocks * (1 - usedPct / 100));
  return { blocks, bavail, bsize: 4096 };
}

function makeCheck(usedPct: number, home = '/home/automaker') {
  return new DiskPressureCheck(
    () => home,
    async () => statfsAtUsedPct(usedPct)
  );
}

describe('DiskPressureCheck', () => {
  it('returns no issues below the warning threshold', async () => {
    const issues = await makeCheck(50).run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues just under the warning threshold', async () => {
    const issues = await makeCheck(79).run('/project');
    expect(issues).toHaveLength(0);
  });

  it('emits a warning between warn and critical thresholds', async () => {
    const issues = await makeCheck(85).run('/project');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].checkId).toBe('disk-pressure');
    expect(issues[0].autoFixable).toBe(false);
    expect(issues[0].context?.path).toBe('/home/automaker');
  });

  it('escalates to critical at/above the critical threshold', async () => {
    const issues = await makeCheck(97).run('/project');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
  });

  it('reports the volume path it inspected', async () => {
    const issues = await makeCheck(90, '/data/agent-home').run('/project');
    expect(issues[0].message).toContain('/data/agent-home');
    expect(issues[0].context?.path).toBe('/data/agent-home');
  });

  it('returns no issues (does not throw) when statfs fails', async () => {
    const check = new DiskPressureCheck(
      () => '/home/automaker',
      async () => {
        throw new Error('ENOENT');
      }
    );
    await expect(check.run('/project')).resolves.toEqual([]);
  });

  it('returns no issues when the filesystem reports zero blocks', async () => {
    const check = new DiskPressureCheck(
      () => '/home/automaker',
      async () => ({ blocks: 0, bavail: 0, bsize: 4096 })
    );
    expect(await check.run('/project')).toEqual([]);
  });
});
