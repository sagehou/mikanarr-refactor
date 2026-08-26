const { readFileSync, writeFileSync } = require('node:fs');
const path = 'public/css/redesign.css';
let css = readFileSync(path, 'utf8');
css = css.replace('--ui-placeholder: #8996a0;', '--ui-placeholder: #758590;');
css = css.replace('--ui-placeholder: #8f9ca5;', '--ui-placeholder: #a8b4bc;');
writeFileSync(path, css);
