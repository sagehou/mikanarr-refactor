(function exposeUi(root, factory) {
  const ui = factory();
  if (typeof module === 'object' && module.exports) module.exports = ui;
  if (root) root.MikanarrUi = ui;
}(typeof window !== 'undefined' ? window : null, () => {
  const toastIcons = {
    success: 'bi-check-circle-fill',
    error: 'bi-x-circle-fill',
    warning: 'bi-exclamation-triangle-fill',
    info: 'bi-info-circle-fill'
  };

  class Toast {
    static container = null;

    static init() {
      if (!this.container || !this.container.isConnected) {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
    }

    static show(message, type = 'info', duration = 3000) {
      this.init();
      const safeType = Object.hasOwn(toastIcons, type) ? type : 'info';
      const toast = document.createElement('div');
      toast.className = `toast-item toast-${safeType}`;

      const icon = document.createElement('i');
      icon.className = `bi ${toastIcons[safeType]} toast-icon`;
      icon.setAttribute('aria-hidden', 'true');

      const content = document.createElement('div');
      content.className = 'toast-content';
      content.textContent = String(message);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-close';
      button.setAttribute('aria-label', '关闭通知');
      const closeIcon = document.createElement('i');
      closeIcon.className = 'bi bi-x';
      closeIcon.setAttribute('aria-hidden', 'true');
      button.appendChild(closeIcon);
      toast.append(icon, content, button);
      this.container.appendChild(toast);

      const close = () => {
        toast.classList.add('toast-leaving');
        setTimeout(() => toast.remove(), 300);
      };
      button.addEventListener('click', close);
      if (duration > 0) setTimeout(close, duration);
      return toast;
    }

    static success(message, duration) { return this.show(message, 'success', duration); }
    static error(message, duration) { return this.show(message, 'error', duration); }
    static warning(message, duration) { return this.show(message, 'warning', duration); }
    static info(message, duration) { return this.show(message, 'info', duration); }
  }

  class ConfirmDialog {
    static show({ title, message, confirmText = '确认', cancelText = '取消', type = 'danger' }) {
      return new Promise(resolve => {
        const safeType = type === 'warning' ? 'warning' : 'danger';
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
          <div class="confirm-dialog" role="dialog" aria-modal="true">
            <div class="confirm-dialog-icon ${safeType}"><i class="bi ${safeType === 'warning' ? 'bi-question-circle-fill' : 'bi-exclamation-triangle-fill'}" aria-hidden="true"></i></div>
            <div class="confirm-dialog-title"></div>
            <div class="confirm-dialog-message"></div>
            <div class="confirm-dialog-buttons">
              <button type="button" class="btn btn-secondary" id="confirm-cancel"></button>
              <button type="button" class="btn btn-${safeType}" id="confirm-ok"></button>
            </div>
          </div>`;

        overlay.querySelector('.confirm-dialog-title').textContent = String(title);
        overlay.querySelector('.confirm-dialog-message').textContent = String(message);
        overlay.querySelector('#confirm-cancel').textContent = String(cancelText);
        overlay.querySelector('#confirm-ok').textContent = String(confirmText);
        document.body.appendChild(overlay);

        let settled = false;
        const handleEscape = event => {
          if (event.key === 'Escape') cleanup(false);
        };
        const cleanup = result => {
          if (settled) return;
          settled = true;
          document.removeEventListener('keydown', handleEscape);
          overlay.remove();
          resolve(result);
        };

        overlay.querySelector('#confirm-ok').addEventListener('click', () => cleanup(true));
        overlay.querySelector('#confirm-cancel').addEventListener('click', () => cleanup(false));
        overlay.addEventListener('click', event => {
          if (event.target === overlay) cleanup(false);
        });
        document.addEventListener('keydown', handleEscape);
        overlay.querySelector('#confirm-cancel').focus();
      });
    }
  }

  return { Toast, ConfirmDialog };
}));
