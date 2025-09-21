// Clean Share Link — single-file logic, no deps
// v1.4: FastSpring popup + Pro unlock; daily free limit = 3, 5s cooldown

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
  const DAILY_LIMIT = 3;                   // free/day
  const COOLDOWN_MS = 5000;                // 5 seconds between cleans
  const STORAGE_KEY = 'csl_quota_v1';
  const LAST_CLEAN_KEY = 'csl_last_ts_v1';
  const PRO_KEY = 'csl_pro_v1';

  let isPro = false;

  // Tracking junk list
  const TRACK_EXACT = new Set([
    'gclid','dclid','fbclid','msclkid','yclid','vero_id','veroid','igshid','si','spm',
    '_hsmi','_hsenc','mkt_tok','sc_channel','ref_src','trk','mc_eid','mc_cid'
  ]);
  const TRACK_PREFIX = ['utm_', 'oly_', 'ga_'];

  // Allow-list when keepParams = false
  const ALLOW_WHEN_STRICT = new Set(['q','query','s','search','id','page','lang']);

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
    // If missing protocol, assume https://
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
    // Returns { ok:boolean, before:string, after:string, changed:boolean, reason?:string }
    const normalized = normalizeUrlInput(input);
    const u0 = tryParseURL(normalized);
    if (!u0){
      return { ok:false, before: input, after:'', changed:false, reason: 'Invalid URL' };
    }

    const u = new URL(u0.href);

    // Force https
    if (opts.forceHttps && u.protocol === 'http:'){
      u.protocol = 'https:';
    }

    // Params handling
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

    return {
      ok:true,
      before,
      after,
      changed: before !== after
    };
  }

  function unlockProUI(){
    isPro = true;
    updateQuotaUI();
    // ukloni lock sa batch sekcije
    const batch = document.querySelector('.batch.pro-locked');
    if (batch) batch.classList.remove('pro-locked');
    // zatvori modal ako je otvoren
    try { closePro(); } catch {}
    showStatus('Pro unlocked. Enjoy!', 'ok');
  }

  // Wire up
  isPro = (localStorage.getItem(PRO_KEY) === '1');
  updateQuotaUI();
  showStatus('Ready.', 'ok');

  cleanBtn.addEventListener('click', () => {
    // Cooldown check
    const leftMs = cooldownLeftMs();
    if (leftMs > 0){
      const sec = Math.ceil(leftMs / 1000);
      showStatus(`Please wait ${sec}s before the next clean.`, 'warn');
      return;
    }

    // Quota check
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

    // Successful attempt → mark time + increment quota (free only)
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

  // Pro modal + ghost batch
  function openPro(){
    modalBackdrop.hidden = false;
    if (typeof proModal.showModal === 'function') proModal.showModal();
    else proModal.style.display = 'block';
  }
  function closePro(){
    modalBackdrop.hidden = true;
    if (typeof proModal.close === 'function') proModal.close();
    else proModal.style.display = 'none';
  }
  proBadge.addEventListener('click', openPro);
  closeModal.addEventListener('click', closePro);
  modalBackdrop.addEventListener('click', closePro);

  // NEW: zatvori naš modal odmah kad krene FS checkout (sprečava overlay konflikt)
  if (upgradeProBtn) upgradeProBtn.addEventListener('click', closePro);

  // Any interaction with ghost batch opens Pro modal (kad korisnik nije Pro)
  const ghostHit = (e) => {
    if (!isPro) {
      e.preventDefault();
      openPro();
      showStatus('Batch mode is a Pro feature.', 'warn');
    }
  };
  if (batchIn) batchIn.addEventListener('focus', ghostHit);
  if (batchCleanBtn) batchCleanBtn.addEventListener('click', ghostHit);
  if (batchExportBtn) batchExportBtn.addEventListener('click', ghostHit);

  // QoL: Ctrl+Enter to clean
  urlIn.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter'){
      cleanBtn.click();
    }
  });

  // FastSpring popup callback (postavljen preko data-popup-closed u index.html)
  window.onFSPopupClosed = function(evt){
    // Ako je orderReference prisutan, kupovina je prošla
    if (evt && evt.orderReference) {
      try { localStorage.setItem(PRO_KEY, '1'); } catch {}
      unlockProUI();
    }
  };
})();
