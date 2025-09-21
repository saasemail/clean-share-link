// Clean Share Link — single-file logic, no deps
// v1.5: robust FS origin check + Pro flag UI class + minor hardening

(function(){
  const el = (id) => document.getElementById(id);

  const urlIn = el('urlIn');
  const forceHttps = el('forceHttps');
  const keepParams = el('keepParams');
  const cleanBtn = el('cleanBtn');
  const resetBtn = el('resetBtn');
  const status = el('status');
  const urlOut = el('urlOut');
  const copyBtn = el('copyBtn');
  const openBtn = el('openBtn');
  const quota = el('quota');

  const proBadge = el('proBadge');
  const proModal = el('proModal');
  const modalBackdrop = el('modalBackdrop');
  const closeModal = el('closeModal');
  const upgradeProBtn = el('upgradePro');

  // Ghost batch controls (Pro-only)
  const batchIn = el('batchIn');
  const batchCleanBtn = el('batchCleanBtn');
  const batchExportBtn = el('batchExportBtn');

  // Free quota (soft, local-only)
  const DAILY_LIMIT = 3;
  const COOLDOWN_MS = 5000;
  const STORAGE_KEY = 'csl_quota_v1';
  const LAST_CLEAN_KEY = 'csl_last_ts_v1';
  const PRO_KEY = 'csl_pro_v1';

  // (REMOVED heuristic keys that caused false unlocks)

  let isPro = false;

  // Tracking junk list
  const TRACK_EXACT = new Set([
    'gclid','dclid','fbclid','msclkid','yclid','vero_id','veroid','igshid','si','spm',
    '_hsmi','_hsenc','mkt_tok','sc_channel','ref_src','trk','mc_eid','mc_cid'
  ]);
  const TRACK_PREFIX = ['utm_', 'oly_', 'ga_'];

  const ALLOW_WHEN_STRICT = new Set(['q','query','s','search','id','page','lang']);

  // ======= robustno skidanje modala iz DOM-a pre FS popupa =======
  let modalRemoved = false;
  let modalPlaceholder = null;
  let backdropPlaceholder = null;

  function reattachModal(){
    if (!modalRemoved) return;
    if (backdropPlaceholder && backdropPlaceholder.parentNode){
      backdropPlaceholder.parentNode.insertBefore(modalBackdrop, backdropPlaceholder);
      backdropPlaceholder.remove();
    } else {
      document.body.insertBefore(modalBackdrop, document.body.firstChild);
    }
    if (modalPlaceholder && modalPlaceholder.parentNode){
      modalPlaceholder.parentNode.insertBefore(proModal, modalPlaceholder);
      modalPlaceholder.remove();
    } else {
      document.body.appendChild(proModal);
    }
    modalRemoved = false;
    modalBackdrop.hidden = true; modalBackdrop.style.display = 'none';
    if (typeof proModal.close === 'function') proModal.close();
    else proModal.style.display = 'none';
  }
  function hardDetachModal(){
    if (modalRemoved) return;
    modalPlaceholder = document.createComment('proModal-placeholder');
    proModal.parentNode.insertBefore(modalPlaceholder, proModal);
    proModal.remove();

    backdropPlaceholder = document.createComment('modalBackdrop-placeholder');
    modalBackdrop.parentNode.insertBefore(backdropPlaceholder, modalBackdrop);
    modalBackdrop.remove();

    modalRemoved = true;
  }
  // ===============================================================

  // Utils
  const todayStr = () => {
    const d = new Date();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${m}-${day}`;
  };

  function readQuota(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return {date: todayStr(), count: 0};
      const obj = JSON.parse(raw);
      if(!obj || obj.date !== todayStr()) return {date: todayStr(), count: 0};
      return obj;
    } catch {
      return {date: todayStr(), count: 0};
    }
  }
  function writeQuota(count){
    const obj = {date: todayStr(), count};
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch {}
    updateQuotaUI();
  }
  function incrementQuota(){
    const q = readQuota();
    const next = q.count + 1;
    writeQuota(next);
    return next;
  }
  function remainingQuota(){
    if (isPro) return Infinity;
    const q = readQuota();
    return Math.max(0, DAILY_LIMIT - q.count);
  }

  function readLastCleanTs(){
    const raw = localStorage.getItem(LAST_CLEAN_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }
  function writeLastCleanTs(ts){
    try { localStorage.setItem(LAST_CLEAN_KEY, String(ts)); } catch {}
  }
  function cooldownLeftMs(){
    if (isPro) return 0;
    const last = readLastCleanTs();
    const delta = Date.now() - last;
    const left = COOLDOWN_MS - delta;
    return Math.max(0, left);
  }

  function updateQuotaUI(){
    if (isPro) {
      quota.textContent = 'Pro: unlimited';
      return;
    }
    const left = remainingQuota();
    quota.textContent = `${left} free cleans left today`;
  }
  function showStatus(text, kind){
    status.textContent = text || '';
    status.className = 'status' + (kind ? ` ${kind}` : '');
  }

  function isTrackingKey(key){
    const k = key.toLowerCase();
    if (TRACK_EXACT.has(k)) return true;
    for (const pref of TRACK_PREFIX){
      if (k.startsWith(pref)) return true;
    }
    return false;
  }

  function normalizeUrlInput(raw){
    let str = (raw || '').trim();
    if (!str) return '';
    if (!/^https?:\/\//i.test(str)){
      str = 'https://' + str;
    }
    return str;
  }
  function tryParseURL(val){
    try { return new URL(val); }
    catch { return null; }
  }

  function cleanURL(input, opts){
    const normalized = normalizeUrlInput(input);
    const u0 = tryParseURL(normalized);
    if (!u0){
      return { ok:false, before: input, after:'', changed:false, reason: 'Invalid URL' };
    }

    const u = new URL(u0.href);

    if (opts.forceHttps && u.protocol === 'http:'){
      u.protocol = 'https:';
    }

    const sp = u.searchParams;

    if (opts.keepParams){
      const toDelete = [];
      for (const [key] of sp.entries()){
        if (isTrackingKey(key)) toDelete.push(key);
      }
      for (const k of toDelete) sp.delete(k);
    } else {
      const toDelete = [];
      for (const [key] of sp.entries()){
        const k = key.toLowerCase();
        const keep = ALLOW_WHEN_STRICT.has(k);
        if (!keep) toDelete.push(key);
      }
      for (const [key] of sp.entries()){
        if (isTrackingKey(key)) toDelete.push(key);
      }
      [...new Set(toDelete)].forEach(k => sp.delete(k));
    }

    u.search = sp.toString();

    const before = u0.href;
    const after = u.href;

    return { ok:true, before, after, changed: before !== after };
  }

  function unlockProUI(){
    isPro = true;
    // trajno zabeleži Pro
    try { localStorage.setItem(PRO_KEY, '1'); } catch {}
    // global UI signal
    document.documentElement.classList.add('is-pro');
    updateQuotaUI();
    const batch = document.querySelector('.batch.pro-locked');
    if (batch) batch.classList.remove('pro-locked');
    try { closePro(); } catch {}
    showStatus('Pro unlocked. Enjoy!', 'ok');
  }

  // Wire up
  isPro = (localStorage.getItem(PRO_KEY) === '1');
  if (isPro) document.documentElement.classList.add('is-pro');
  updateQuotaUI();
  if (isPro) {
    const batch = document.querySelector('.batch.pro-locked');
    if (batch) batch.classList.remove('pro-locked');
  }
  showStatus('Ready.', 'ok');

  // === SINGLE CLEAN ===
  cleanBtn.addEventListener('click', () => {
    const leftMs = cooldownLeftMs();
    if (leftMs > 0){
      const sec = Math.ceil(leftMs / 1000);
      showStatus(`Please wait ${sec}s before the next clean.`, 'warn');
      return;
    }

    if (!isPro && remainingQuota() <= 0){
      showStatus('Free limit reached for today.', 'warn');
      return;
    }

    const raw = urlIn.value;
    if (!raw.trim()){
      showStatus('Please paste a URL to clean.', 'err');
      return;
    }

    const res = cleanURL(raw, {
      forceHttps: !!forceHttps.checked,
      keepParams: !!keepParams.checked
    });

    if (!res.ok){
      showStatus('Unesi validan URL (npr. https://example.com).', 'err');
      urlOut.value = '';
      return;
    }

    urlOut.value = res.after;

    if (res.changed){
      showStatus('Cleaned ✓ tracking junk removed.', 'ok');
    } else {
      showStatus('Already clean · nothing to remove.', 'warn');
    }

    if (!isPro) {
      writeLastCleanTs(Date.now());
      incrementQuota();
    }
  });

  resetBtn.addEventListener('click', () => {
    urlIn.value = '';
    urlOut.value = '';
    showStatus('Reset.', 'ok');
    updateQuotaUI();
  });

  copyBtn.addEventListener('click', async () => {
    const val = urlOut.value.trim();
    if (!val){
      showStatus('Nothing to copy yet.', 'err');
      return;
    }
    try {
      await navigator.clipboard.writeText(val);
      showStatus('Copied to clipboard.', 'ok');
    } catch {
      showStatus('Copy failed. Select and copy manually.', 'err');
    }
  });

  openBtn.addEventListener('click', () => {
    const val = urlOut.value.trim();
    if (!val){
      showStatus('Nothing to open yet.', 'err');
      return;
    }
    window.open(val, '_blank', 'noopener,noreferrer');
  });

  // === BATCH CLEAN (Pro) — ostaje kako je ===
  function autoResizeBatch(){
    if (!batchIn) return;
    batchIn.style.height = 'auto';
    const max = Math.min(600, batchIn.scrollHeight);
    batchIn.style.height = Math.max(120, max) + 'px';
  }

  function getBatchLines(){
    return (batchIn?.value || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function handleBatchClean(){
    if (!isPro) {
      openPro();
      showStatus('Batch mode is a Pro feature.', 'warn');
      return;
    }
    const lines = getBatchLines();
    if (!lines.length){
      showStatus('Paste 1+ URLs (one per line) to clean.', 'err');
      return;
    }
    const opts = { forceHttps: !!forceHttps.checked, keepParams: !!keepParams.checked };
    const results = lines.map((line) => {
      const r = cleanURL(line, opts);
      return r.ok ? r.after : line;
    });
    batchIn.value = results.join('\n');
    autoResizeBatch();
    showStatus(`Batch cleaned: ${results.length} URL${results.length>1?'s':''}.`, 'ok');
  }

  function handleBatchExport(){
    if (!isPro) {
      openPro();
      showStatus('Batch export is a Pro feature.', 'warn');
      return;
    }
    const lines = getBatchLines();
    if (!lines.length){
      showStatus('Nothing to export. Paste URLs first.', 'err');
      return;
    }
    const opts = { forceHttps: !!forceHttps.checked, keepParams: !!keepParams.checked };
    const rows = [['original','cleaned','changed']];
    lines.forEach(l => {
      const r = cleanURL(l, opts);
      if (r.ok){
        rows.push([r.before, r.after, String(r.changed)]);
      } else {
        rows.push([l, l, 'false']);
      }
    });
    const csv = rows.map(row =>
      row.map(v => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    const ts = new Date();
    const pad = n => String(n).padStart(2,'0');
    const fname = `cleaned-links-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.csv`;
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    showStatus(`Exported ${lines.length} URLs to CSV.`, 'ok');
  }

  if (batchIn){
    batchIn.addEventListener('input', autoResizeBatch);
    window.addEventListener('load', autoResizeBatch);
  }
  if (batchCleanBtn) batchCleanBtn.addEventListener('click', handleBatchClean);
  if (batchExportBtn) batchExportBtn.addEventListener('click', handleBatchExport);
  // === KRAJ BATCH BLOKA ===

  // Pro modal
  function openPro(){
    reattachModal();
    modalBackdrop.hidden = false;
    if (typeof proModal.showModal === 'function') proModal.showModal();
    else proModal.style.display = 'block';
  }
  function closePro(){
    modalBackdrop.hidden = true;
    modalBackdrop.style.display = 'none';
    if (typeof proModal.close === 'function') proModal.close();
    else proModal.style.display = 'none';
  }
  proBadge.addEventListener('click', openPro);
  closeModal.addEventListener('click', closePro);
  modalBackdrop.addEventListener('click', closePro);

  // ---- FastSpring: ručno otvaranje nakon zatvaranja modala ----
  async function waitForFS(ms=2000){
    const t0 = Date.now();
    while (!window.fastspring || !window.fastspring.builder){
      if (Date.now()-t0 > ms) throw new Error('FastSpring not loaded');
      await new Promise(r => setTimeout(r, 25));
    }
    return window.fastspring;
  }

  // REG: SBL događaji (jasni signali uspešne kupovine)
  function registerFSEvents(fs){
    if (!fs || !fs.builder || !fs.builder.on) return;
    const fire = ()=> unlockProUI();
    [
      'purchased',
      'completed','complete','order.completed','checkout.completed',
      'subscription.activated'
    ].forEach(name => {
      try { fs.builder.on(name, fire); } catch {}
    });
  }

  async function openFSCheckout(){
    try{
      const fs = await waitForFS();
      registerFSEvents(fs);
      try{ fs.builder.reset(); }catch{}
      fs.builder.add('cslpro');
      fs.builder.checkout();
    }catch(e){
      console.warn(e);
      showStatus('Checkout is loading… please try again in a moment.', 'warn');
    }
  }

  // SKINI data-fsc-* sa dugmeta, i mi preuzimamo kontrolu
  if (upgradeProBtn){
    upgradeProBtn.removeAttribute('data-fsc-action');
    upgradeProBtn.removeAttribute('data-fsc-item-path-value');

    const trigger = (e)=>{
      try{ e.preventDefault(); e.stopPropagation(); }catch{}
      closePro();
      hardDetachModal();
      setTimeout(openFSCheckout, 20); // pusti FS-u da uhvati fokus
    };
    upgradeProBtn.addEventListener('pointerdown', trigger, {capture:true});
    upgradeProBtn.addEventListener('mousedown',   trigger, {capture:true});
    upgradeProBtn.addEventListener('click',       trigger, {capture:true});
  }

  // QoL: Ctrl+Enter to clean
  urlIn.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter'){
      cleanBtn.click();
    }
  });

  // FastSpring popup callback (fallback – sada samo “hard” signal)
  window.onFSPopupClosed = function(evt){
    reattachModal();
    if (evt && (evt.orderReference || evt.completed === true || evt.success === true)) {
      unlockProUI();
    }
  };

  // postMessage iz FS (samo uz jasan signal)
  window.addEventListener('message', (e) => {
    try{
      const origin = String(e.origin || '');
      let host = '';
      try { host = new URL(origin).hostname; } catch {}

      const isFS =
        /\.onfastspring\.com$/.test(host) ||
        /\.fastspring\.com$/.test(host)   ||
        /fastspring/i.test(host);

      if (!isFS) return;

      const d = e.data || {};
      const type =
        d.type || d.event || d.fsEvent ||
        (d.events && d.events[0] && d.events[0].type) || '';
      const ref =
        d.orderReference ||
        (d.data && d.data.orderReference) ||
        (d.events && d.events[0] && d.events[0].data && d.events[0].data.orderReference);

      const looksDone =
        !!ref ||
        /(order|subscription).*completed|subscription\.activated|checkout\.completed/i.test(type);

      if (looksDone) unlockProUI();
    }catch{}
  });

  // Ako se SBL učita kasnije, registruj hookove
  (async () => {
    try {
      const fs = await waitForFS(6000);
      registerFSEvents(fs);
    } catch {}
  })();

})();
