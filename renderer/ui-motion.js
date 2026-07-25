/**
 * UI motion helpers. Soft ease-out continuity; controlled by data-ui-motion.
 */

const ENTER_MS = 200;
const EXIT_MS = 140;

export function isUiMotionEnabled(config) {
  if (config?.uiMotion === false) return false;
  if (typeof window !== 'undefined') {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      return false;
    }
    if (document.documentElement.dataset.uiMotion === '0') return false;
  }
  return config?.uiMotion !== false;
}

export function syncUiMotion(config) {
  const html = document.documentElement;
  const enabled = isUiMotionEnabled(config);
  html.dataset.uiMotion = enabled ? '1' : '0';
  return enabled;
}

/**
 * Swap main view with a short fade/slide.
 * Falls back to instant replace when motion is off.
 */
export function swapMainView(mainEl, nextView, { enabled } = {}) {
  if (!mainEl || !nextView) return Promise.resolve();
  const motionOn = enabled !== false && document.documentElement.dataset.uiMotion !== '0';

  if (!motionOn) {
    mainEl.replaceChildren(nextView);
    return Promise.resolve();
  }

  const current = mainEl.firstElementChild;
  if (!current || current === nextView) {
    mainEl.replaceChildren(nextView);
    nextView.classList.add('ui-motion-enter');
    return settleClass(nextView, 'ui-motion-enter', ENTER_MS);
  }

  current.classList.remove('ui-motion-enter');
  current.classList.add('ui-motion-exit');
  return settleClass(current, 'ui-motion-exit', EXIT_MS).then(() => {
    mainEl.replaceChildren(nextView);
    nextView.classList.add('ui-motion-enter');
    return settleClass(nextView, 'ui-motion-enter', ENTER_MS);
  });
}

/**
 * Animate settings content panel replacement inside an existing shell.
 */
export function swapPanelContent(hostEl, nextPanel, { enabled } = {}) {
  if (!hostEl || !nextPanel) return Promise.resolve();
  const motionOn = enabled !== false && document.documentElement.dataset.uiMotion !== '0';
  if (!motionOn) {
    hostEl.replaceChildren(nextPanel);
    return Promise.resolve();
  }
  const current = hostEl.firstElementChild;
  if (!current) {
    hostEl.replaceChildren(nextPanel);
    nextPanel.classList.add('ui-motion-panel-enter');
    return settleClass(nextPanel, 'ui-motion-panel-enter', ENTER_MS);
  }
  current.classList.add('ui-motion-panel-exit');
  return settleClass(current, 'ui-motion-panel-exit', EXIT_MS).then(() => {
    hostEl.replaceChildren(nextPanel);
    nextPanel.classList.add('ui-motion-panel-enter');
    return settleClass(nextPanel, 'ui-motion-panel-enter', ENTER_MS);
  });
}

function settleClass(el, className, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.remove(className);
      resolve();
    };
    const onEnd = (ev) => {
      if (ev.target !== el) return;
      el.removeEventListener('animationend', onEnd);
      finish();
    };
    el.addEventListener('animationend', onEnd);
    window.setTimeout(finish, ms + 60);
  });
}
