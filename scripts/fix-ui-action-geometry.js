const { readFileSync, writeFileSync } = require('node:fs');

const path = 'public/css/redesign.css';
let css = readFileSync(path, 'utf8');
const marker = 'UI polish v2.1: hard-normalize compact card actions.';
if (!css.includes(marker)) {
  css += `\n\n/* ${marker} */\n.pattern-card-footer .pattern-card-actions > .btn {\n  box-sizing: border-box !important;\n  flex: 0 0 32px !important;\n  width: 32px !important;\n  min-width: 32px !important;\n  max-width: 32px !important;\n  height: 32px !important;\n  min-height: 32px !important;\n  max-height: 32px !important;\n  padding: 0 !important;\n  line-height: 1 !important;\n}\n`;
}
writeFileSync(path, css);
