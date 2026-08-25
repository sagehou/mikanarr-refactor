const { readFileSync, writeFileSync } = require('node:fs');
const path = 'scripts/refine-ui-layout.js';
let text = readFileSync(path, 'utf8');
const before = "      regex = new RegExp('^' + source + '$');";
const after = "      regex = new RegExp('^' + source + String.fromCharCode(36));";
if (!text.includes(before)) throw new Error('refinement regex anchor not found');
writeFileSync(path, text.replace(before, after));
