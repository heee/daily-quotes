(function () {
  'use strict';

  // ---------- Storage (all access guarded) ----------
  const KEYS = { theme: 'quotes.theme', user: 'quotes.user', reactions: 'quotes.reactions', recent: 'quotes.recent' };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  // ---------- Elements ----------
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const stage = $('stage');
  const quoteEl = $('quote');
  const textEl = $('quoteText');
  const authorEl = $('quoteAuthor');
  const sourceEl = $('quoteSource');
  const toastEl = $('toast');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // ---------- State ----------
  let seed = [];
  let userQuotes = load(KEYS.user, []);
  let reactions = load(KEYS.reactions, {});
  let recent = load(KEYS.recent, []);
  let history = [];   // ids shown this session
  let cursor = -1;
  let animating = false;

  if (!Array.isArray(userQuotes)) userQuotes = [];
  if (!reactions || typeof reactions !== 'object') reactions = {};
  if (!Array.isArray(recent)) recent = [];

  function library() {
    const byId = new Map();
    seed.forEach((q) => byId.set(q.id, q));
    userQuotes.forEach((q) => byId.set(q.id, q));
    return Array.from(byId.values());
  }
  function findQuote(id) {
    return library().find((q) => q.id === id);
  }
  function currentId() {
    return cursor >= 0 ? history[cursor] : null;
  }

  // ---------- Date ----------
  function renderDate() {
    const d = new Date();
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
    const month = d.toLocaleDateString('en-GB', { month: 'long' });
    $('date').textContent = weekday + ', ' + d.getDate() + ' ' + month;
  }

  // ---------- Weighted pick ----------
  function weightOf(q, now) {
    const r = reactions[q.id];
    if (r && r.restUntil && r.restUntil > now) return 0.15;
    const up = r && r.up ? r.up : 0;
    return 1 + 0.5 * Math.min(up, 6);
  }

  function pickNext() {
    const all = library();
    if (!all.length) return null;
    const now = Date.now();
    const current = currentId() || recent[recent.length - 1];
    let pool = all.filter((q) => q.id !== current);
    if (all.length > 8) {
      const avoid = new Set(recent.slice(-5));
      const fresh = pool.filter((q) => !avoid.has(q.id));
      if (fresh.length) pool = fresh;
    }
    if (!pool.length) pool = all;
    const weights = pool.map((q) => weightOf(q, now));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function remember(id) {
    recent = recent.filter((x) => x !== id);
    recent.push(id);
    recent = recent.slice(-5);
    save(KEYS.recent, recent);
  }

  // ---------- Rendering ----------
  function render(q) {
    if (!q) return;
    textEl.textContent = q.text;
    textEl.lang = q.lang || 'en';
    authorEl.textContent = q.author || '';
    sourceEl.textContent = q.source || '';
    fitText(q.text.length);
  }

  // Step the quote size down for long quotes, then further if it still collides with the top bar.
  function fitText(len) {
    const steps = ['s1', 's2', 's3', 's4'];
    textEl.classList.remove(...steps);
    let level = len > 260 ? 2 : len > 180 ? 1 : 0;
    if (level) textEl.classList.add(steps[level - 1]);
    while (level < steps.length && quoteEl.scrollHeight > stage.clientHeight - 16) {
      if (level) textEl.classList.remove(steps[level - 1]);
      textEl.classList.add(steps[level]);
      level++;
    }
  }

  function showNew(q) {
    if (!q) return;
    history = history.slice(0, cursor + 1);
    history.push(q.id);
    cursor = history.length - 1;
    remember(q.id);
    render(q);
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  // ---------- Motion ----------
  const OUT_MS = 260, SWAP_MS = 240, IN_MS = 260, SPRING_MS = 260;

  function setPos(x, y, opacity, ms) {
    quoteEl.style.transition = ms ? `transform ${ms}ms ease, opacity ${ms}ms ease` : 'none';
    quoteEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    quoteEl.style.opacity = String(opacity);
  }

  function springBack() {
    setPos(0, 0, 1, SPRING_MS);
  }

  // out: [x,y] to exit to, enter: [x,y] to come in from, swap: fn that changes content
  function transition(out, enter, swap) {
    animating = true;
    if (reduceMotion.matches) {
      setPos(0, 0, 0, 200);
      setTimeout(() => {
        swap();
        setPos(0, 0, 1, 200);
        setTimeout(() => { animating = false; }, 200);
      }, 200);
      return;
    }
    setPos(out[0], out[1], 0, OUT_MS);
    setTimeout(() => {
      swap();
      setPos(enter[0], enter[1], 0, 0);
      void quoteEl.offsetWidth;
      setPos(0, 0, 1, IN_MS);
      setTimeout(() => { animating = false; }, IN_MS);
    }, SWAP_MS);
  }

  // ---------- Actions ----------
  function advance() {
    if (cursor < history.length - 1) {
      cursor++;
      render(findQuote(history[cursor]));
    } else {
      showNew(pickNext());
    }
  }

  function goNext() {
    if (animating) return;
    transition([-420, 0], [90, 0], advance);
  }

  function goPrev() {
    if (animating) return;
    if (cursor <= 0) { springBack(); return; }
    transition([420, 0], [-90, 0], () => {
      cursor--;
      render(findQuote(history[cursor]));
    });
  }

  function resonate() {
    if (animating) return;
    const id = currentId();
    if (id) {
      const r = reactions[id] || { up: 0 };
      r.up = (r.up || 0) + 1;
      delete r.restUntil;
      reactions[id] = r;
      save(KEYS.reactions, reactions);
    }
    toast('Stays with me');
    transition([0, -260], [0, 60], advance);
  }

  function notToday() {
    if (animating) return;
    const id = currentId();
    if (id) {
      const r = reactions[id] || { up: 0 };
      r.restUntil = Date.now() + 3 * 24 * 60 * 60 * 1000;
      reactions[id] = r;
      save(KEYS.reactions, reactions);
    }
    toast('Resting for now');
    transition([0, 260], [0, -60], advance);
  }

  const ACTIONS = { next: goNext, prev: goPrev, up: resonate, down: notToday };

  // ---------- Gestures ----------
  let drag = null;

  stage.addEventListener('pointerdown', (e) => {
    if (animating || e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), axis: null, dx: 0, dy: 0, samples: [] };
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });

  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    const now = performance.now();
    drag.samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (drag.samples.length > 2 && now - drag.samples[0].t > 100) drag.samples.shift();
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    drag.dx = drag.axis === 'x' ? dx : 0;
    drag.dy = drag.axis === 'y' ? dy * 0.6 : 0;
    const fade = 1 - Math.min(Math.abs(drag.dx) + Math.abs(drag.dy), 240) / 480;
    setPos(drag.dx, drag.dy, fade, 0);
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.axis) return;
    let v = 0;
    const s = d.samples;
    if (s.length >= 2) {
      const a = s[0], b = s[s.length - 1];
      const dt = Math.max(1, b.t - a.t);
      v = d.axis === 'x' ? (b.x - a.x) / dt : (b.y - a.y) / dt;
    }
    const raw = d.axis === 'x' ? e.clientX - d.x0 : e.clientY - d.y0;
    const committed = Math.abs(raw) >= 70 || (Math.abs(v) > 0.5 && Math.sign(v) === Math.sign(raw));
    if (!committed || e.type === 'pointercancel') { springBack(); return; }
    if (d.axis === 'x') raw < 0 ? goNext() : goPrev();
    else raw < 0 ? resonate() : notToday();
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (sheetOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    const map = { ArrowLeft: goNext, ArrowRight: goPrev, ArrowUp: resonate, ArrowDown: notToday };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  });

  document.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => ACTIONS[b.dataset.act]());
  });

  // ---------- Theme ----------
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_NAMES = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  const THEME_ICONS = {
    auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 8h4.5M12 12h6M12 16h4.5"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'
  };
  const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
  let theme = root.getAttribute('data-theme') || 'auto';

  function applyTheme() {
    root.setAttribute('data-theme', theme);
    $('themeIcon').innerHTML = THEME_ICONS[theme];
    $('themeBtn').setAttribute('aria-label', `Appearance: ${THEME_NAMES[theme]}. Tap to change.`);
    const dark = theme === 'dark' || (theme === 'auto' && darkQuery.matches);
    const color = dark ? '#131517' : '#F3F1EC';
    themeMetas.forEach((m) => {
      if (theme === 'auto') m.content = m.media.includes('dark') ? '#131517' : '#F3F1EC';
      else m.content = color;
    });
  }

  let labelTimer;
  $('themeBtn').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try { localStorage.setItem(KEYS.theme, theme); } catch (e) {} // raw string: read by the inline <head> script
    applyTheme();
    const label = $('themeLabel');
    label.textContent = THEME_NAMES[theme];
    label.classList.add('show');
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => label.classList.remove('show'), 1400);
  });
  darkQuery.addEventListener('change', applyTheme);

  // ---------- Sheets ----------
  let sheetOpen = null;
  let lastFocus = null;

  function openSheet(sheet, backdrop) {
    lastFocus = document.activeElement;
    sheetOpen = { sheet, backdrop };
    backdrop.hidden = false;
    sheet.hidden = false;
    sheet.style.transform = '';
    void sheet.offsetWidth;
    backdrop.classList.add('open');
    sheet.classList.add('open');
  }

  function closeSheet() {
    if (!sheetOpen) return;
    const { sheet, backdrop } = sheetOpen;
    sheetOpen = null;
    if (document.activeElement && sheet.contains(document.activeElement)) document.activeElement.blur();
    sheet.classList.remove('open', 'dragging');
    sheet.style.transform = '';
    backdrop.classList.remove('open');
    setTimeout(() => {
      if (sheetOpen && sheetOpen.sheet === sheet) return;
      sheet.hidden = true;
      backdrop.hidden = true;
    }, 320);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetOpen) closeSheet();
  });

  // Swipe a sheet down to close (from its grabber / header).
  document.querySelectorAll('.sheet').forEach((sheet) => {
    let sd = null;
    sheet.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('[data-grip]') || e.target.closest('button')) return;
      sd = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 };
      sheet.classList.add('dragging');
      try { sheet.setPointerCapture(e.pointerId); } catch (err) {}
    });
    sheet.addEventListener('pointermove', (e) => {
      if (!sd || e.pointerId !== sd.id) return;
      sd.dy = Math.max(0, e.clientY - sd.y0);
      sheet.style.transform = `translateY(${sd.dy}px)`;
    });
    const end = (e) => {
      if (!sd || e.pointerId !== sd.id) return;
      const v = sd.dy / Math.max(1, performance.now() - sd.t0);
      const close = sd.dy > 100 || (sd.dy > 20 && v > 0.5);
      sd = null;
      sheet.classList.remove('dragging');
      sheet.style.transform = '';
      if (close) closeSheet();
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
  });

  // Keep sheets above the iOS keyboard.
  function onViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--kb', kb + 'px');
    root.style.setProperty('--vvh', vv.height + 'px');
    document.querySelectorAll('.sheet').forEach((s) => s.classList.toggle('kb', kb > 40));
    const f = document.activeElement;
    if (kb > 40 && f && f.closest && f.closest('.sheet')) {
      requestAnimationFrame(() => f.scrollIntoView({ block: 'nearest' }));
    }
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewport);
    window.visualViewport.addEventListener('scroll', onViewport);
  }

  // ---------- Add a quote ----------
  const addSheet = $('addSheet');
  const addBackdrop = $('addBackdrop');
  const fText = $('fText');
  const fAuthor = $('fAuthor');
  const fSource = $('fSource');
  const addSave = $('addSave');

  function autoGrow() {
    fText.style.height = 'auto';
    fText.style.height = fText.scrollHeight + 'px';
  }
  function validate() {
    addSave.disabled = !(fText.value.trim() && fAuthor.value.trim());
  }

  $('addBtn').addEventListener('click', () => {
    $('addForm').reset();
    validate();
    openSheet(addSheet, addBackdrop);
    autoGrow();
    fText.focus({ preventScroll: true }); // synchronous with the tap so iOS raises the keyboard
  });
  fText.addEventListener('input', () => { autoGrow(); validate(); });
  fAuthor.addEventListener('input', validate);
  fSource.addEventListener('input', validate);
  [fText, fAuthor, fSource].forEach((el) =>
    el.addEventListener('focus', () => setTimeout(onViewport, 300)));
  fAuthor.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fSource.focus(); } });
  fSource.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!addSave.disabled) saveQuote(); } });
  $('addForm').addEventListener('submit', (e) => e.preventDefault());
  $('addCancel').addEventListener('click', closeSheet);
  addBackdrop.addEventListener('click', closeSheet);
  addSave.addEventListener('click', saveQuote);

  const GERMAN = /[äöüß]|\b(der|die|das|und|ist|nicht|ich|du|sich)\b/i;
  function detectLang(text) {
    return GERMAN.test(text) ? 'de' : 'en';
  }

  function saveQuote() {
    const text = fText.value.trim();
    const author = fAuthor.value.trim();
    const source = fSource.value.trim();
    if (!text || !author) return;
    const now = Date.now();
    const q = { id: 'u-' + now, text, author, lang: detectLang(text), addedAt: now };
    if (source) q.source = source;
    userQuotes.push(q);
    save(KEYS.user, userQuotes);
    closeSheet();
    setPos(0, 0, 1, 0);
    showNew(q);
    toast('Saved');
  }

  // ---------- Share as image ----------
  const shareSheet = $('shareSheet');
  const shareBackdrop = $('shareBackdrop');
  const preview = $('sharePreview');
  let shareFile = null;
  let previewUrl = null;
  const SHOW_WORDMARK = false;

  function wrap(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  async function renderImage(q) {
    const W = 1080, H = 1350, M = 110;
    const maxW = W - M * 2;
    try {
      await Promise.all([
        document.fonts.load('300 72px Newsreader', q.text),
        document.fonts.load('300 150px Newsreader', '“'),
        document.fonts.load('400 38px Newsreader', q.author),
        document.fonts.load('italic 400 32px Newsreader', q.source || 'a')
      ]);
    } catch (e) {}

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F3F1EC';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    const markSize = 150, markH = markSize * 0.5, gap = 56;
    const authorSize = 38, sourceSize = 32;
    let size = 72, lines, lh;
    for (; size >= 36; size -= 2) {
      ctx.font = `300 ${size}px Newsreader, Georgia, serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = (-0.01 * size).toFixed(2) + 'px';
      lines = wrap(ctx, q.text, maxW);
      lh = size * 1.22;
      const total = markH + gap + lines.length * lh + gap + authorSize * 1.3 + (q.source ? sourceSize * 1.4 : 0);
      if (total <= H - M * 2) break;
    }
    const attrH = authorSize * 1.3 + (q.source ? sourceSize * 1.4 : 0);
    const blockH = markH + gap + lines.length * lh + gap + attrH;
    let y = Math.round((H - blockH) / 2);

    ctx.fillStyle = '#4F6B5A';
    ctx.font = `300 ${markSize}px Newsreader, Georgia, serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillText('“', M - 4, y + markSize * 0.62);
    y += markH + gap;

    ctx.fillStyle = '#1A1C1E';
    ctx.font = `300 ${size}px Newsreader, Georgia, serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (-0.01 * size).toFixed(2) + 'px';
    for (const line of lines) {
      ctx.fillText(line, M, y + size * 0.95);
      y += lh;
    }
    y += gap;

    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.font = `400 ${authorSize}px Newsreader, Georgia, serif`;
    ctx.fillText(q.author, M, y + authorSize);
    y += authorSize * 1.3;
    if (q.source) {
      ctx.fillStyle = '#5E6268';
      ctx.font = `italic 400 ${sourceSize}px Newsreader, Georgia, serif`;
      ctx.fillText(q.source, M, y + sourceSize * 1.15);
    }

    if (SHOW_WORDMARK) {
      ctx.fillStyle = '#5E6268';
      ctx.font = 'italic 400 26px Newsreader, Georgia, serif';
      ctx.fillText('Daily Quotes', M, H - 70);
    }

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    return blob;
  }

  function fileName(q) {
    const slug = (q.author || 'quote').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `quote-${slug || 'daily'}.png`;
  }

  $('shareBtn').addEventListener('click', async () => {
    const q = findQuote(currentId());
    if (!q) return;
    shareFile = null;
    preview.removeAttribute('src');
    openSheet(shareSheet, shareBackdrop);
    const blob = await renderImage(q);
    if (!blob) return;
    shareFile = new File([blob], fileName(q), { type: 'image/png' });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    preview.src = previewUrl;
    preview.alt = `Image of the quote by ${q.author}`;
  });

  function canShareFile() {
    try {
      return !!(shareFile && navigator.canShare && navigator.canShare({ files: [shareFile] }));
    } catch (e) { return false; }
  }

  function download() {
    if (!shareFile) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = shareFile.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function shareOrSave(preferDownload) {
    if (!shareFile) return;
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (canShareFile() && (!preferDownload || isIOS)) {
      try {
        await navigator.share({ files: [shareFile] });
      } catch (e) {
        if (e && e.name !== 'AbortError' && preferDownload) download();
      }
      return;
    }
    download();
  }

  $('shareImage').addEventListener('click', () => shareOrSave(false));
  $('saveImage').addEventListener('click', () => shareOrSave(true));
  shareBackdrop.addEventListener('click', closeSheet);

  // ---------- Lifecycle ----------
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    renderDate();
    if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000 && !sheetOpen && !animating) {
      setPos(0, 0, 1, 0);
      showNew(pickNext());
    }
    hiddenAt = 0;
  });

  // Roll the date over at midnight.
  (function scheduleMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(() => { renderDate(); scheduleMidnight(); }, next - now);
  })();

  window.addEventListener('resize', () => {
    const q = findQuote(currentId());
    if (q) fitText(q.text.length);
  });

  async function loadSeed() {
    try {
      const res = await fetch('quotes.json');
      const data = await res.json();
      if (Array.isArray(data)) return data.filter((q) => q && q.id && q.text);
    } catch (e) {}
    return [];
  }

  async function init() {
    renderDate();
    applyTheme();
    seed = await loadSeed();
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) {}
    }
    showNew(pickNext());

    try {
      if (!localStorage.getItem('quotes.persistAsked') && navigator.storage && navigator.storage.persist) {
        localStorage.setItem('quotes.persistAsked', '1');
        navigator.storage.persist();
      }
    } catch (e) {}

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
