const { SVGIcons2SVGFontStream } = require('svgicons2svgfont');
const svg2ttf = require('svg2ttf');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const fontName = 'batradar-icons';
const files = [
  { name: 'claude', path: path.join(__dirname, '..', 'icons', 'claude.svg'), code: 0xE001 },
  { name: 'codex', path: path.join(__dirname, '..', 'icons', 'codex.svg'), code: 0xE002 },
];

async function svgToSvgFont() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const fontStream = new SVGIcons2SVGFontStream({
      fontName,
      fontHeight: 1000,
      normalize: true,
      log: () => {},
    });
    fontStream.on('data', chunk => chunks.push(chunk));
    fontStream.on('end', () => resolve(chunks.join('')));
    fontStream.on('error', reject);
    for (const file of files) {
      const glyph = new Readable({ read() {} });
      glyph.push(fs.readFileSync(file.path, 'utf8'));
      glyph.push(null);
      glyph.metadata = { name: file.name, unicode: [String.fromCodePoint(file.code)] };
      fontStream.write(glyph);
    }
    fontStream.end();
  });
}

(async () => {
  const svgFont = await svgToSvgFont();
  const ttf = svg2ttf(svgFont, {});
  fs.writeFileSync(path.join(__dirname, '..', 'fonts', 'batradar-icons.ttf'), Buffer.from(ttf.buffer));
  console.log('TTF font generated successfully');
})().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
