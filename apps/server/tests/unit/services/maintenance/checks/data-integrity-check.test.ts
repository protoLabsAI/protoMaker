import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataIntegrityCheck } from '@/services/maintenance/checks/data-integrity-check.js';

describe('DataIntegrityCheck', () => {
  let check: DataIntegrityCheck;
  let mockWatchdog: { checkIntegrity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWatchdog = { checkIntegrity: vi.fn() };
    check = new DataIntegrityCheck(mockWatchdog as any);
  });

  it('returns no issues when integrity is intact', async () => {
    mockWatchdog.checkIntegrity.mockResolvedValue({
      intact: true,
      currentCount: 50,
      lastKnownCount: 50,
      dropPercentage: 0,
    });

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns critical issue when integrity is breached', async () => {
    mockWatchdog.checkIntegrity.mockResolvedValue({
      intact: false,
      currentCount: 10,
      lastKnownCount: 50,
      dropPercentage: 80,
      errorMessage: 'Feature count dropped significantly',
    });

    const issues = await check.run('/project');

    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe('data-integrity');
    expect(issues[0].severity).toBe('critical');
    expect(issues[0].autoFixable).toBe(false);
    expect(issues[0].message).toContain('80%');
    expect(issues[0].message).toContain('50');
    expect(issues[0].message).toContain('10');
  });

  it('returns empty array when watchdog throws', async () => {
    mockWatchdog.checkIntegrity.mockRejectedValue(new Error('disk error'));
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('passes projectPath to watchdog', async () => {
    mockWatchdog.checkIntegrity.mockResolvedValue({
      intact: true,
      currentCount: 5,
      lastKnownCount: 5,
      dropPercentage: 0,
    });
    await check.run('/my/project');
    expect(mockWatchdog.checkIntegrity).toHaveBeenCalledWith('/my/project');
  });
});
