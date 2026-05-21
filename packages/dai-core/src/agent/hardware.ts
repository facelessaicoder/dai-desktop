import * as os from 'os';
import { execSync } from 'child_process';

export type AccelerationType = 'cuda' | 'metal' | 'vulkan' | 'cpu';

export interface HardwareInfo {
  acceleration: AccelerationType;
  gpuName?: string;
  vramMB?: number;
  ramMB: number;
  cpuCores: number;
  platform: 'win32' | 'darwin' | 'linux';
}

export class HardwareDetect {
  static detect(): HardwareInfo {
    const platform = process.platform as HardwareInfo['platform'];
    const ramMB = Math.round(os.totalmem() / 1024 / 1024);
    const cpuCores = os.cpus().length;

    if (platform === 'darwin') {
      // All Apple Silicon and modern Intel Macs support Metal
      return { acceleration: 'metal', ramMB, cpuCores, platform };
    }

    if (platform === 'win32') {
      try {
        const out = execSync(
          'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
          { timeout: 3000, encoding: 'utf8' },
        );
        const [gpuName, vramStr] = out.trim().split(', ');
        return {
          acceleration: 'cuda',
          gpuName: gpuName?.trim(),
          vramMB: parseInt(vramStr ?? '0', 10),
          ramMB,
          cpuCores,
          platform,
        };
      } catch { /* no NVIDIA */ }

      try {
        execSync('vulkaninfo --summary', { timeout: 3000 });
        return { acceleration: 'vulkan', ramMB, cpuCores, platform };
      } catch { /* no Vulkan */ }
    }

    return { acceleration: 'cpu', ramMB, cpuCores, platform };
  }

  // Recommended context window size based on available memory
  static contextSize(hw: HardwareInfo): number {
    const available = hw.vramMB ?? (hw.acceleration === 'cpu' ? hw.ramMB * 0.6 : hw.ramMB);
    if (available > 16000) return 32768;
    if (available > 8000)  return 16384;
    if (available > 4000)  return 8192;
    return 4096;
  }

  // Recommended GPU layers to offload (-1 = all)
  static gpuLayers(hw: HardwareInfo): number {
    if (hw.acceleration === 'cpu') return 0;
    const vram = hw.vramMB ?? 0;
    if (vram > 12000) return -1;   // full offload
    if (vram > 6000)  return 28;   // most layers
    if (vram > 3000)  return 16;   // partial
    return 8;
  }
}
