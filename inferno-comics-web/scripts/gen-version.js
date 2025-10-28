const fs   = require('fs');
const pkg  = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const out  = `export const APP_VERSION = '${pkg.version}';\n`;
fs.writeFileSync('src/app/version.ts', out);