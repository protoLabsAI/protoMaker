import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryPressureCheck } from '@/services/maintenance/checks/memory-pressure-check.js';

describe('MemoryPressureCheck', () => {
  const check = new MemoryPressureCheck();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns no issues when memory is below warning threshold', async () => {
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      heapUsed: 100 * 1024 * 1024, // 100 MB
      heapTotal: 200 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0,
      rss: 150 * 1024 * 1024,
    });

    // Mock v8.getHeapStatistics to return 1 GB limit
    const v8 = await import('v8');
    vi.spyOn(v8.default, 'getHeapStatistics').mockReturnValue({
      heap_size_limit: 1024 * 1024 * 1024,
      total_heap_size: 200 * 1024 * 1024,
      used_heap_size: 100 * 1024 * 1024,
      total_heap_size_executable: 0,
      total_physical_size: 0,
      total_available_size: 0,
      malloced_memory: 0,
      peak_malloced_memory: 0,
      does_zap_garbage: 0,
      number_of_native_contexts: 0,
      number_of_detached_contexts: 0,
      total_global_handles_size: 0,
      used_global_handles_size: 0,
      external_memory: 0,
    });

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns warning issue when memory is between 80% and 95%', async () => {
    const heapLimit = 1024 * 1024 * 1024; // 1 GB
    const heapUsed = Math.round(heapLimit * 0.85); // 85%

    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      heapUsed,
      heapTotal: heapLimit,
      external: 0,
      arrayBuffers: 0,
      rss: heapUsed,
    });

    const v8 = await import('v8');
    vi.spyOn(v8.default, 'getHeapStatistics').mockReturnValue({
      heap_size_limit: heapLimit,
      total_heap_size: heapLimit,
      used_heap_size: heapUsed,
      total_heap_size_executable: 0,
      total_physical_size: 0,
      total_available_size: 0,
      malloced_memory: 0,
      peak_malloced_memory: 0,
      does_zap_garbage: 0,
      number_of_native_contexts: 0,
      number_of_detached_contexts: 0,
      total_global_handles_size: 0,
      used_global_handles_size: 0,
      external_memory: 0,
    });

    const issues = await check.run('/project');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].autoFixable).toBe(false);
    expect(issues[0].checkId).toBe('memory-pressure');
  });

  it('returns critical issue when memory is above 95%', async () => {
    const heapLimit = 1024 * 1024 * 1024;
    const heapUsed = Math.round(heapLimit * 0.97);

    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      heapUsed,
      heapTotal: heapLimit,
      external: 0,
      arrayBuffers: 0,
      rss: heapUsed,
    });

    const v8 = await import('v8');
    vi.spyOn(v8.default, 'getHeapStatistics').mockReturnValue({
      heap_size_limit: heapLimit,
      total_heap_size: heapLimit,
      used_heap_size: heapUsed,
      total_heap_size_executable: 0,
      total_physical_size: 0,
      total_available_size: 0,
      malloced_memory: 0,
      peak_malloced_memory: 0,
      does_zap_garbage: 0,
      number_of_native_contexts: 0,
      number_of_detached_contexts: 0,
      total_global_handles_size: 0,
      used_global_handles_size: 0,
      external_memory: 0,
    });

    const issues = await check.run('/project');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('critical');
  });
});
