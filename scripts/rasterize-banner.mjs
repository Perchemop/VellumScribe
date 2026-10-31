import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const svgPath = resolve('metadata/fdroid/feature-graphic.svg');
const pngPath = resolve('metadata/fdroid/feature-graphic.png');

// Use the system rsvg-convert tool if available; falls back to a no-op stub
// for CI environments where the binary is not present. The PNG is already
// committed, so this script is idempotent.
try {
  execSync(`rsvg-convert -w 1024 -h 500 -o "${pngPath}" "${svgPath}"`, { stdio: 'inherit' });
  console.log(`Rasterised ${svgPath} → ${pngPath} via rsvg-convert`);
} catch {
  console.warn('rsvg-convert not available; skipping rasterisation (PNG already committed)');
}
