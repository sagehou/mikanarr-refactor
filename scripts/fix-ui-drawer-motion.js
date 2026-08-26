const { readFileSync, writeFileSync } = require('node:fs');

const jsPath = 'public/js/redesign.js';
let js = readFileSync(jsPath, 'utf8');
const oldOpen = `    const edit = document.getElementById('pattern-edit');\n    edit?.classList.remove('is-open');\n    void edit?.offsetWidth;\n    edit?.classList.add('is-open');\n    edit?.setAttribute('aria-hidden', 'false');\n    applyEditorTab(pattern ? 'matching' : 'settings');\n    return result;`;
const newOpen = `    const edit = document.getElementById('pattern-edit');\n    edit?.classList.remove('is-open');\n    edit?.setAttribute('aria-hidden', 'false');\n    if (this.uiDrawerOpenFrame) window.cancelAnimationFrame(this.uiDrawerOpenFrame);\n    this.uiDrawerOpenFrame = window.requestAnimationFrame(() => {\n      this.uiDrawerOpenFrame = window.requestAnimationFrame(() => {\n        this.uiDrawerOpenFrame = null;\n        edit?.classList.add('is-open');\n      });\n    });\n    applyEditorTab(pattern ? 'matching' : 'settings');\n    return result;`;
if (!js.includes(oldOpen)) throw new Error('drawer open anchor not found');
js = js.replace(oldOpen, newOpen);

const oldClose = `    document.body.classList.remove('ui-drawer-open');\n    edit?.classList.remove('is-open');`;
const newClose = `    document.body.classList.remove('ui-drawer-open');\n    if (this.uiDrawerOpenFrame) {\n      window.cancelAnimationFrame(this.uiDrawerOpenFrame);\n      this.uiDrawerOpenFrame = null;\n    }\n    edit?.classList.remove('is-open');`;
if (!js.includes(oldClose)) throw new Error('drawer close anchor not found');
js = js.replace(oldClose, newClose);
js = js.replace('    window.setTimeout(finish, 230);', '    window.setTimeout(finish, 250);');
writeFileSync(jsPath, js);

const cssPath = 'public/css/redesign.css';
let css = readFileSync(cssPath, 'utf8');
const marker = 'UI polish v2.2: deliberate drawer motion.';
if (!css.includes(marker)) {
  css += `\n\n/* ${marker} */\n#pattern-edit.pattern-edit {\n  transition:\n    transform 240ms cubic-bezier(.25, .1, .25, 1),\n    opacity 200ms ease,\n    visibility 0s linear 240ms;\n}\n#pattern-edit.pattern-edit.is-open {\n  transition:\n    transform 240ms cubic-bezier(.25, .1, .25, 1),\n    opacity 200ms ease,\n    visibility 0s linear 0s;\n}\n.app-content {\n  transition: width 240ms cubic-bezier(.25, .1, .25, 1), margin 240ms cubic-bezier(.25, .1, .25, 1);\n}\n`;
}
writeFileSync(cssPath, css);
