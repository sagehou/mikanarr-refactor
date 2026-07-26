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
  assert.equal(toast.querySelector('img'), null);
  assert.equal(toast.querySelector('[onerror]'), null);

  dom.window.close();
  delete global.window;
  delete global.document;
});

test('ConfirmDialog renders caller strings as text and removes its Escape listener on cancel', async () => {
  const dom = installDom();
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
  assert.equal(overlay.querySelector('.confirm-dialog-title').textContent, payload);
  assert.equal(overlay.querySelector('.confirm-dialog-message').textContent, payload);
  assert.equal(overlay.querySelector('#confirm-ok').textContent, payload);
  assert.equal(overlay.querySelector('#confirm-cancel').textContent, payload);
  assert.equal(overlay.querySelector('img'), null);

  overlay.querySelector('#confirm-cancel').click();
  assert.equal(await result, false);
  assert.equal(removedListener, keydownListener);

  dom.window.close();
  delete global.window;
  delete global.document;
});
