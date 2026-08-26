const { readFileSync, writeFileSync } = require('node:fs');

const path = 'public/js/redesign.js';
let js = readFileSync(path, 'utf8');

const oldOpen = `    const edit = document.getElementById('pattern-edit');\n    edit?.classList.remove('is-open');\n    edit?.setAttribute('aria-hidden', 'false');\n    if (this.uiDrawerOpenFrame) window.cancelAnimationFrame(this.uiDrawerOpenFrame);\n    this.uiDrawerOpenFrame = window.requestAnimationFrame(() => {\n      this.uiDrawerOpenFrame = window.requestAnimationFrame(() => {\n        this.uiDrawerOpenFrame = null;\n        edit?.classList.add('is-open');\n      });\n    });\n    applyEditorTab(pattern ? 'matching' : 'settings');\n    return result;`;

const newOpen = `    const edit = document.getElementById('pattern-edit');\n    edit?.setAttribute('aria-hidden', 'false');\n    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n    if (edit) {\n      edit.getAnimations?.().forEach(animation => animation.cancel());\n      edit.classList.add('is-open');\n      if (!reducedMotion && typeof edit.animate === 'function') {\n        const animation = edit.animate(\n          [\n            { transform: 'translateX(100%)', opacity: 0.96 },\n            { transform: 'translateX(0)', opacity: 1 }\n          ],\n          { duration: 260, easing: 'cubic-bezier(.2, .72, .22, 1)', fill: 'both' }\n        );\n        this.uiDrawerAnimation = animation;\n        animation.finished.then(() => {\n          if (this.uiDrawerAnimation === animation) this.uiDrawerAnimation = null;\n          animation.cancel();\n        }).catch(() => {});\n      }\n    }\n    applyEditorTab(pattern ? 'matching' : 'settings');\n    return result;`;

if (!js.includes(oldOpen)) throw new Error('drawer open block not found');
js = js.replace(oldOpen, newOpen);

const oldClosePrefix = `    document.body.classList.remove('ui-drawer-open');\n    if (this.uiDrawerOpenFrame) {\n      window.cancelAnimationFrame(this.uiDrawerOpenFrame);\n      this.uiDrawerOpenFrame = null;\n    }\n    edit?.classList.remove('is-open');\n    edit?.setAttribute('aria-hidden', 'true');`;

const newClosePrefix = `    document.body.classList.remove('ui-drawer-open');\n    if (this.uiDrawerAnimation) {\n      this.uiDrawerAnimation.cancel();\n      this.uiDrawerAnimation = null;\n    }\n    edit?.setAttribute('aria-hidden', 'true');`;

if (!js.includes(oldClosePrefix)) throw new Error('drawer close prefix not found');
js = js.replace(oldClosePrefix, newClosePrefix);

const oldFinishBlock = `    if (!edit || reducedMotion) {\n      finish();\n      return;\n    }\n\n    window.setTimeout(finish, 250);`;

const newFinishBlock = `    if (!edit || reducedMotion || typeof edit.animate !== 'function') {\n      edit?.classList.remove('is-open');\n      finish();\n      return;\n    }\n\n    const closingAnimation = edit.animate(\n      [\n        { transform: 'translateX(0)', opacity: 1 },\n        { transform: 'translateX(100%)', opacity: 0.96 }\n      ],\n      { duration: 220, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'both' }\n    );\n    this.uiDrawerAnimation = closingAnimation;\n    closingAnimation.finished.then(() => {\n      if (this.uiDrawerAnimation === closingAnimation) this.uiDrawerAnimation = null;\n      closingAnimation.cancel();\n      edit.classList.remove('is-open');\n      finish();\n    }).catch(() => {});`;

if (!js.includes(oldFinishBlock)) throw new Error('drawer close finish block not found');
js = js.replace(oldFinishBlock, newFinishBlock);

writeFileSync(path, js);
