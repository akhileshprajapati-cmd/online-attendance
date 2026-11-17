(() => {
  const tabs = [...document.querySelectorAll('[data-login-tab]')];
  const panels = [...document.querySelectorAll('[data-login-panel]')];
  function activate(name) {
    tabs.forEach(tab => {
      const active = tab.dataset.loginTab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    panels.forEach(panel => panel.classList.toggle('hidden', panel.dataset.loginPanel !== name));
    const feedback = document.querySelector('.login-feedback');
    if (feedback) feedback.textContent = `${name[0].toUpperCase()}${name.slice(1)} secure access`;
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab.dataset.loginTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); activate(tabs[next].dataset.loginTab);
    });
  });
  document.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    button.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
  }));
  let installPrompt = null;
  const installBtn = document.getElementById('installAppBtn');
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event;
    if (installBtn) installBtn.classList.add('ready');
  });
  if (installBtn) installBtn.addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null;
    } else {
      alert('Chrome menu (⋮) खोलें और “Install app” या “Add to Home screen” चुनें।');
    }
  });
  window.addEventListener('appinstalled', () => { if (installBtn) installBtn.textContent = 'App Installed'; });
})();
