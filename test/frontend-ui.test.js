const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { Toast, ConfirmDialog } = require('../public/js/ui');

const payload = '<img src=x onerror="globalThis.pwned=1">';

function installDom() {
  const dom = new JSDOM('<!doctype html><body></body>');
  global.window = dom.window;
  global.document = dom.window.document;
  Toast.container = null;
  return dom;
}

test('Toast renders caller messages as text', () => {
  const dom = installDom();
  const toast = Toast.show(payload, 'error', 0);

  assert.equal(toast.querySelector('.toast-content').textContent, payload);
  assert.equal(toast.getAttribute('role'), 'alert');
  assert.equal(toast.getAttribute('aria-atomic'), 'true');
  assert.equal(toast.querySelector('img'), null);
  assert.equal(toast.querySelector('[onerror]'), null);

  dom.window.close();
  delete global.window;
  delete global.document;
});

test('ConfirmDialog renders caller strings as text and removes its Escape listener on cancel', async () => {
  const dom = installDom();
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();
  const added = document.addEventListener.bind(document);
  const removed = document.removeEventListener.bind(document);
  let keydownListener;
  let removedListener;
  document.addEventListener = (type, listener, options) => {
    if (type === 'keydown') keydownListener = listener;
    return added(type, listener, options);
  };
  document.removeEventListener = (type, listener, options) => {
    if (type === 'keydown') removedListener = listener;
    return removed(type, listener, options);
  };

  const result = ConfirmDialog.show({
    title: payload,
    message: payload,
    confirmText: payload,
    cancelText: payload
  });
  const overlay = document.querySelector('.confirm-overlay');
  const dialog = overlay.querySelector('.confirm-dialog');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'confirm-dialog-title');
  assert.equal(dialog.getAttribute('aria-describedby'), 'confirm-dialog-message');
  assert.equal(overlay.querySelector('.confirm-dialog-title').textContent, payload);
  assert.equal(overlay.querySelector('.confirm-dialog-message').textContent, payload);
  assert.equal(overlay.querySelector('#confirm-ok').textContent, payload);
  assert.equal(overlay.querySelector('#confirm-cancel').textContent, payload);
  assert.equal(overlay.querySelector('img'), null);

  const cancel = overlay.querySelector('#confirm-cancel');
  const confirm = overlay.querySelector('#confirm-ok');
  assert.equal(document.activeElement, cancel);
  cancel.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, confirm);
  confirm.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, cancel);

  cancel.click();
  assert.equal(await result, false);
  assert.equal(removedListener, keydownListener);
  assert.equal(document.activeElement, trigger);

  dom.window.close();
  delete global.window;
  delete global.document;
});
