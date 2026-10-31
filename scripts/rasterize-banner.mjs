import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const svgPath = resolve('metadata/fdroid/feature-graphic.svg');
const pngPath = resolve('metadata/fdroid/feature-graphic.png');

const svg = readFileSync(svgPath, 'utf8');
const resvg = new Resvg(svg, {
  fitTo: {
    mode: 'original',
  },
});

const pngData = resvg.render().asPng();
writeFileSync(pngPath, pngData);
console.log(`Rasterised ${svgPath} → ${pngPath} (${pngData.length} bytes)`);
