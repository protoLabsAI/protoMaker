/**
 * System Health Crew Member - Host-level resource monitoring
 *
 * Lightweight check (every 10 min):
 *   - System RAM usage (os.freemem/totalmem)
 *   - Swap usage (swapon --show)
 *   - Disk space (df)
 *   - CPU load average vs core count
 *   - Temperature (Linux thermal zones)
 *   - GPU/VRAM (nvidia-smi, if available)
 *   - Large/zombie processes (ps aux)
 *   - Total process count
 *
 * Escalates to Frank when: warning or higher findings detected
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { createLogger } from '@automaker/utils';
import type {
  CrewMemberDefinition,
  CrewCheckContext,
  CrewCheckResult,
} from '../crew-loop-service.js';

const logger = createLogger('CrewMember:SystemHealth');
const PLATFORM = process.platform; // 'darwin' | 'linux' | 'win32'

// Thresholds
const RAM_WARNING_PERCENT = 85;
const RAM_CRITICAL_PERCENT = 95;
const SWAP_WARNING_PERCENT = 80;
const SWAP_CRITICAL_PERCENT = 95;
const DISK_WARNING_PERCENT = 85;
const DISK_CRITICAL_PERCENT = 95;
const TEMP_WARNING_C = 80;
const TEMP_CRITICAL_C = 90;
const GPU_WARNING_PERCENT = 85;
const GPU_CRITICAL_PERCENT = 95;
const LARGE_PROC_WARNING = 5;
const LARGE_PROC_CRITICAL = 10;
const PROC_COUNT_WARNING = 200;
const PROC_COUNT_CRITICAL = 500;
const CPU_LOAD_WARNING_FACTOR = 0.8;
const CPU_LOAD_CRITICAL_FACTOR = 1.5;
const EXEC_TIMEOUT_MS = 2000;

/** Safe shell exec with timeout — returns empty string on failure */
function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { timeout: EXEC_TIMEOUT_MS, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

export const systemHealthCrewMember: CrewMemberDefinition = {
  id: 'system-health',
  displayName: 'System Health Monitor',
  templateName: 'frank',
  defaultSchedule: '*/10 * * * *',
  enabledByDefault: true,

  async check(_ctx: CrewCheckContext): Promise<CrewCheckResult> {
    type Severity = CrewCheckResult['severity'];
    const findings: CrewCheckResult['findings'] = [];
    const metrics: Record<string, unknown> = {};

    const SEVERITY_RANK: Record<Severity, number> = { ok: 0, info: 1, warning: 2, critical: 3 };
    let maxRank = 0;

    function raise(severity: Severity) {
      const rank = SEVERITY_RANK[severity];
      if (rank > maxRank) maxRank = rank;
    }

    // 1. System RAM
    // macOS: os.freemem() is misleading — compressed/cached pages counted as "used"
    // gives false 99% usage alerts. Use memory_pressure CLI for accurate readings.
    try {
      const totalBytes = os.totalmem();
      const totalGB = (totalBytes / 1024 / 1024 / 1024).toFixed(1);
      let usedPercent: number;
      let usedGB: string;
      let freeGB: string;
      let ramSource: string;

      if (PLATFORM === 'darwin') {
        // macOS: use memory_pressure for accurate readings
        const mpOutput = safeExec('/usr/bin/memory_pressure');
        const match = mpOutput.match(/free percentage:\s*(\d+)/);
        if (match) {
          const freePercent = parseInt(match[1], 10);
          usedPercent = 100 - freePercent;
          const freeBytes = (totalBytes * freePercent) / 100;
          const usedBytes = totalBytes - freeBytes;
          usedGB = (usedBytes / 1024 / 1024 / 1024).toFixed(1);
          freeGB = (freeBytes / 1024 / 1024 / 1024).toFixed(1);
          ramSource = 'memory_pressure';
        } else {
          // Fallback to os.freemem() if memory_pressure unavailable
          const freeBytes = os.freemem();
          const usedBytes = totalBytes - freeBytes;
          usedPercent = Math.round((usedBytes / totalBytes) * 100);
          usedGB = (usedBytes / 1024 / 1024 / 1024).toFixed(1);
          freeGB = (freeBytes / 1024 / 1024 / 1024).toFixed(1);
          ramSource = 'os.freemem (fallback)';
        }
      } else {
        // Linux/Windows: os.freemem() is accurate
        const freeBytes = os.freemem();
        const usedBytes = totalBytes - freeBytes;
        usedPercent = Math.round((usedBytes / totalBytes) * 100);
        usedGB = (usedBytes / 1024 / 1024 / 1024).toFixed(1);
        freeGB = (freeBytes / 1024 / 1024 / 1024).toFixed(1);
        ramSource = 'os.freemem';
      }

      metrics.ramTotalGB = totalGB;
      metrics.ramUsedGB = usedGB;
      metrics.ramFreeGB = freeGB;
      metrics.ramUsedPercent = usedPercent;
      metrics.ramSource = ramSource;

      if (usedPercent >= RAM_CRITICAL_PERCENT) {
        findings.push({
          type: 'ram-critical',
          message: `System RAM critical: ${usedGB}GB / ${totalGB}GB (${usedPercent}% used, ${freeGB}GB free) [${ramSource}]`,
          severity: 'critical',
          context: { usedGB, totalGB, freeGB, usedPercent, ramSource },
        });
        raise('critical');
      } else if (usedPercent >= RAM_WARNING_PERCENT) {
        findings.push({
          type: 'ram-warning',
          message: `System RAM elevated: ${usedGB}GB / ${totalGB}GB (${usedPercent}% used, ${freeGB}GB free) [${ramSource}]`,
          severity: 'warning',
          context: { usedGB, totalGB, freeGB, usedPercent, ramSource },
        });
        raise('warning');
      }
    } catch (error) {
      logger.warn('Failed to check system RAM:', error);
    }

    // 2. Swap usage (platform-specific)
    try {
      let totalSwap = 0;
      let usedSwap = 0;

      if (PLATFORM === 'linux') {
        const swapOutput = safeExec('swapon --show --bytes --noheadings');
        if (swapOutput) {
          for (const line of swapOutput.split('\n')) {
            const parts = line.trim().split(/\s+/);
            // Format: NAME TYPE SIZE USED PRIO
            if (parts.length >= 4) {
              totalSwap += parseInt(parts[2], 10) || 0;
              usedSwap += parseInt(parts[3], 10) || 0;
            }
          }
        }
      } else if (PLATFORM === 'darwin') {
        // macOS: sysctl vm.swapusage → "vm.swapusage: total = 2048.00M  used = 512.00M  free = 1536.00M"
        const swapOutput = safeExec('sysctl vm.swapusage');
        if (swapOutput) {
          const totalMatch = swapOutput.match(/total\s*=\s*([\d.]+)M/);
          const usedMatch = swapOutput.match(/used\s*=\s*([\d.]+)M/);
          if (totalMatch) totalSwap = parseFloat(totalMatch[1]) * 1024 * 1024; // MB → bytes
          if (usedMatch) usedSwap = parseFloat(usedMatch[1]) * 1024 * 1024;
        }
      }
      // Windows: skip swap check (pagefile semantics differ)

      if (totalSwap > 0) {
        const swapPercent = Math.round((usedSwap / totalSwap) * 100);
        const totalSwapGB = (totalSwap / 1024 / 1024 / 1024).toFixed(1);
        const usedSwapGB = (usedSwap / 1024 / 1024 / 1024).toFixed(1);

        metrics.swapTotalGB = totalSwapGB;
        metrics.swapUsedGB = usedSwapGB;
        metrics.swapUsedPercent = swapPercent;

        if (swapPercent >= SWAP_CRITICAL_PERCENT) {
          findings.push({
            type: 'swap-critical',
            message: `Swap exhausted: ${usedSwapGB}GB / ${totalSwapGB}GB (${swapPercent}% used)`,
            severity: 'critical',
            context: { usedSwapGB, totalSwapGB, swapPercent },
          });
          raise('critical');
        } else if (swapPercent >= SWAP_WARNING_PERCENT) {
          findings.push({
            type: 'swap-warning',
            message: `Swap elevated: ${usedSwapGB}GB / ${totalSwapGB}GB (${swapPercent}% used)`,
            severity: 'warning',
            context: { usedSwapGB, totalSwapGB, swapPercent },
          });
          raise('warning');
        }
      } else {
        metrics.swapTotalGB = '0';
        metrics.swapUsedGB = '0';
        metrics.swapUsedPercent = 0;
      }
    } catch (error) {
      logger.warn('Failed to check swap:', error);
    }

    // 3. Disk space (root partition, platform-specific df flags)
    try {
      let dfOutput: string;
      if (PLATFORM === 'linux') {
        dfOutput = safeExec('df --output=pcent / | tail -1');
      } else if (PLATFORM === 'darwin') {
        // macOS df doesn't support --output; use POSIX mode
        dfOutput = safeExec("df -P / | awk 'NR==2 {print $5}'");
      } else {
        dfOutput = ''; // Windows: skip
      }

      if (dfOutput) {
        const diskPercent = parseInt(dfOutput.replace('%', '').trim(), 10);
        if (!isNaN(diskPercent)) {
          metrics.diskUsedPercent = diskPercent;

          if (diskPercent >= DISK_CRITICAL_PERCENT) {
            findings.push({
              type: 'disk-critical',
              message: `Root disk critical: ${diskPercent}% used`,
              severity: 'critical',
              context: { diskPercent },
            });
            raise('critical');
          } else if (diskPercent >= DISK_WARNING_PERCENT) {
            findings.push({
              type: 'disk-warning',
              message: `Root disk elevated: ${diskPercent}% used`,
              severity: 'warning',
              context: { diskPercent },
            });
            raise('warning');
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to check disk space:', error);
    }

    // 4. CPU load
    try {
      const loadAvg1 = os.loadavg()[0];
      const cpuCount = os.cpus().length;
      const loadRatio = loadAvg1 / cpuCount;

      metrics.loadAvg1 = loadAvg1.toFixed(2);
      metrics.loadAvg5 = os.loadavg()[1].toFixed(2);
      metrics.loadAvg15 = os.loadavg()[2].toFixed(2);
      metrics.cpuCount = cpuCount;
      metrics.loadRatio = loadRatio.toFixed(2);

      if (loadRatio >= CPU_LOAD_CRITICAL_FACTOR) {
        findings.push({
          type: 'cpu-critical',
          message: `CPU load critical: ${loadAvg1.toFixed(1)} (${cpuCount} cores, ratio ${loadRatio.toFixed(2)})`,
          severity: 'critical',
          context: { loadAvg1, cpuCount, loadRatio },
        });
        raise('critical');
      } else if (loadRatio >= CPU_LOAD_WARNING_FACTOR) {
        findings.push({
          type: 'cpu-warning',
          message: `CPU load elevated: ${loadAvg1.toFixed(1)} (${cpuCount} cores, ratio ${loadRatio.toFixed(2)})`,
          severity: 'warning',
          context: { loadAvg1, cpuCount, loadRatio },
        });
        raise('warning');
      }
    } catch (error) {
      logger.warn('Failed to check CPU load:', error);
    }

    // 5. Temperature (Linux thermal zones)
    try {
      const tempRaw = readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf-8').trim();
      const tempC = parseInt(tempRaw, 10) / 1000;
      if (!isNaN(tempC)) {
        metrics.temperatureC = tempC;

        if (tempC >= TEMP_CRITICAL_C) {
          findings.push({
            type: 'temp-critical',
            message: `CPU temperature critical: ${tempC}°C`,
            severity: 'critical',
            context: { tempC },
          });
          raise('critical');
        } else if (tempC >= TEMP_WARNING_C) {
          findings.push({
            type: 'temp-warning',
            message: `CPU temperature elevated: ${tempC}°C`,
            severity: 'warning',
            context: { tempC },
          });
          raise('warning');
        }
      }
    } catch {
      // No thermal zone — skip silently (VMs, containers, non-Linux)
    }

    // 6. GPU/VRAM (nvidia-smi)
    try {
      const gpuOutput = safeExec(
        'nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits'
      );
      if (gpuOutput) {
        const gpus = gpuOutput.split('\n').filter(Boolean);
        for (let i = 0; i < gpus.length; i++) {
          const parts = gpus[i].split(',').map((s) => parseInt(s.trim(), 10));
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] > 0) {
            const usedMB = parts[0];
            const totalMB = parts[1];
            const gpuPercent = Math.round((usedMB / totalMB) * 100);

            metrics[`gpu${i}UsedMB`] = usedMB;
            metrics[`gpu${i}TotalMB`] = totalMB;
            metrics[`gpu${i}UsedPercent`] = gpuPercent;

            if (gpuPercent >= GPU_CRITICAL_PERCENT) {
              findings.push({
                type: 'gpu-critical',
                message: `GPU ${i} VRAM critical: ${usedMB}MB / ${totalMB}MB (${gpuPercent}%)`,
                severity: 'critical',
                context: { gpu: i, usedMB, totalMB, gpuPercent },
              });
              raise('critical');
            } else if (gpuPercent >= GPU_WARNING_PERCENT) {
              findings.push({
                type: 'gpu-warning',
                message: `GPU ${i} VRAM elevated: ${usedMB}MB / ${totalMB}MB (${gpuPercent}%)`,
                severity: 'warning',
                context: { gpu: i, usedMB, totalMB, gpuPercent },
              });
              raise('warning');
            }
          }
        }
      }
    } catch {
      // No nvidia-smi — skip silently
    }

    // 7. Large processes (RSS > 1GB) and process count (platform-specific ps flags)
    try {
      let psCmd: string;
      if (PLATFORM === 'linux') {
        psCmd = 'ps aux --sort=-%mem';
      } else if (PLATFORM === 'darwin') {
        // macOS ps doesn't support --sort; -m sorts by memory
        psCmd = 'ps aux -m';
      } else {
        psCmd = ''; // Windows: skip process enumeration
      }

      const psOutput = psCmd ? safeExec(psCmd) : '';
      if (psOutput) {
        const lines = psOutput.split('\n');
        // First line is header, rest are processes
        const procCount = lines.length - 1;
        metrics.processCount = procCount;

        // Parse processes with RSS > 1GB (RSS is column 6, in KB)
        const largeProcs: { name: string; rssMB: number; pid: string }[] = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length >= 11) {
            const pid = parts[1];
            const rssKB = parseInt(parts[5], 10);
            const command = parts.slice(10).join(' ');
            if (!isNaN(rssKB) && rssKB > 1024 * 1024) {
              // > 1GB
              largeProcs.push({
                name: command.substring(0, 80),
                rssMB: Math.round(rssKB / 1024),
                pid,
              });
            }
          }
        }

        metrics.largeProcessCount = largeProcs.length;
        if (largeProcs.length > 0) {
          metrics.largeProcesses = largeProcs
            .slice(0, 10)
            .map((p) => `${p.pid}: ${p.rssMB}MB ${p.name}`);
        }

        if (largeProcs.length >= LARGE_PROC_CRITICAL) {
          findings.push({
            type: 'large-procs-critical',
            message: `${largeProcs.length} processes using >1GB RSS each — potential zombie/leak`,
            severity: 'critical',
            context: { count: largeProcs.length, top5: largeProcs.slice(0, 5) },
          });
          raise('critical');
        } else if (largeProcs.length >= LARGE_PROC_WARNING) {
          findings.push({
            type: 'large-procs-warning',
            message: `${largeProcs.length} processes using >1GB RSS each`,
            severity: 'warning',
            context: { count: largeProcs.length, top5: largeProcs.slice(0, 5) },
          });
          raise('warning');
        }

        if (procCount >= PROC_COUNT_CRITICAL) {
          findings.push({
            type: 'proc-count-critical',
            message: `Very high process count: ${procCount}`,
            severity: 'critical',
            context: { procCount },
          });
          raise('critical');
        } else if (procCount >= PROC_COUNT_WARNING) {
          findings.push({
            type: 'proc-count-warning',
            message: `Elevated process count: ${procCount}`,
            severity: 'warning',
            context: { procCount },
          });
          raise('warning');
        }
      }
    } catch (error) {
      logger.warn('Failed to check processes:', error);
    }

    // 8. System uptime (info only)
    try {
      const uptimeSec = os.uptime();
      const days = Math.floor(uptimeSec / 86400);
      const hours = Math.floor((uptimeSec % 86400) / 3600);
      metrics.uptimeDays = days;
      metrics.uptimeHours = hours;
      metrics.uptimeFormatted = `${days}d ${hours}h`;
    } catch {
      // Non-critical
    }

    const RANK_TO_SEVERITY: Severity[] = ['ok', 'info', 'warning', 'critical'];
    const maxSeverity = RANK_TO_SEVERITY[maxRank] ?? 'ok';
    const needsEscalation = maxRank >= SEVERITY_RANK.warning;

    const summary =
      findings.length === 0
        ? `System healthy — ${metrics.ramFreeGB ?? '?'}GB RAM free, ${metrics.cpuCount ?? '?'} cores, uptime ${metrics.uptimeFormatted ?? '?'}`
        : `${findings.length} finding(s), status: ${maxSeverity}`;

    return {
      needsEscalation,
      summary,
      severity: maxSeverity,
      findings,
      metrics,
    };
  },

  buildEscalationPrompt(result: CrewCheckResult): string {
    const findingsList = result.findings
      .map((f) => `- [${f.severity.toUpperCase()}] ${f.type}: ${f.message}`)
      .join('\n');

    const remediationHints: string[] = [];
    for (const f of result.findings) {
      if (f.type.startsWith('ram-') || f.type.startsWith('large-procs-')) {
        remediationHints.push(
          '- **RAM/Processes**: Identify and kill zombie processes with `ps aux --sort=-%mem | head -20`'
        );
      }
      if (f.type.startsWith('swap-')) {
        remediationHints.push(
          '- **Swap**: Kill memory hogs first, then clear swap with `swapoff -a && swapon -a`'
        );
      }
      if (f.type.startsWith('disk-')) {
        remediationHints.push(
          '- **Disk**: Clean Docker (`docker system prune`), check `/tmp` and log files'
        );
      }
      if (f.type.startsWith('temp-')) {
        remediationHints.push(
          '- **Temperature**: Check fan speeds, reduce workload, check ambient temperature'
        );
      }
      if (f.type.startsWith('gpu-')) {
        remediationHints.push(
          '- **GPU/VRAM**: List GPU processes with `nvidia-smi`, kill unused ones'
        );
      }
      if (f.type.startsWith('cpu-')) {
        remediationHints.push(
          '- **CPU**: Check for runaway processes with `top -b -n1 | head -20`'
        );
      }
    }
    // Deduplicate hints
    const uniqueHints = [...new Set(remediationHints)];

    return `Host system health is ${result.severity}. Automated crew loop check detected issues requiring attention.

**Findings:**
${findingsList}

**Metrics:** ${JSON.stringify(result.metrics, null, 2)}

**Remediation hints:**
${uniqueHints.join('\n')}

Please:
1. Investigate the findings above and diagnose root causes
2. Use get_detailed_health and health_check to correlate with server-level metrics
3. Read server logs if issues may be application-related
4. Take corrective action for critical issues (kill zombies, free disk, etc.)
5. Post findings and actions taken to Discord #infra

This is an automated triage request triggered by the crew loop system.`;
  },

  escalationTools: [
    'Read',
    'Bash',
    'mcp__plugin_automaker_automaker__get_detailed_health',
    'mcp__plugin_automaker_automaker__health_check',
    'mcp__plugin_automaker_automaker__get_server_logs',
    'mcp__plugin_automaker_discord__discord_send',
  ],
};
