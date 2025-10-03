// Clean Share Link — logic + SubID Matrix Tracker (no deps)
// Base v1.5 + SMT additions (AFF credits + CSV export)

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

  // Batch (Pro)
  const batchIn = el('batchIn');
  const batchCleanBtn = el('batchCleanBtn');
  const batchExportBtn = el('batchExportBtn');

  // SMT (Affiliate)
  const smtEnable = el('smtEnable');
  const channelsIn = el('channelsIn');
  const keepUtms = el('keepUtms');
  const smtAnalyzeBtn = el('smtAnalyzeBtn');
  const smtExportBtn = el('smtExportBtn');
  const smtPreview = el('smtPreview');
  const buyAffBtn = el('buyAffBtn');
  const affCreditsBadge = el('affCredits');

  // Quotas/keys
  const DAILY_LIMIT = 3;
  const COOLDOWN_MS = 5000;
  const STORAGE_KEY = 'csl_quota_v1';
  const LAST_CLEAN_KEY = 'csl_last_ts_v1';
  const PRO_KEY = 'csl_pro_v1';

  // Affiliate credits (client-side)
  const AFF_CREDITS_KEY = 'csl_aff_credits';

  // Checkout heuristics
  const CHECKOUT_TS_KEY = 'csl_checkout_ts';
  const CHECKOUT_VALID_MS = 15 * 60 * 1000;

  let isPro = false;

  // Tracking junk
  const TRACK_EXACT = new Set([
    'gclid','dclid','fbclid','msclkid','yclid','vero_id','veroid','igshid','si','spm',
    '_hsmi','_hsenc','mkt_tok','sc_channel','ref_src','trk','mc_eid','mc_cid'
  ]);
  const TRACK_PREFIX = ['utm_', 'oly_', 'ga_'];
  const ALLOW_WHEN_STRICT = new Set(['q','query','s','search','id','page','lang']);

  // === SMT reference data (no deps) ===
  const NETWORKS = [
    { id:"amazon", host:/(^|\.)amazon\./i, subParam:"ascsubtag",
      keep:["tag","ascsubtag"], remove:["qid","sr","ref","smid","spIA","keywords","_encoding"],
      deeplinkKeys:[], required:["tag"], canonical:"amazon" },
    { id:"ebay", host:/(^|\.)ebay\./i, subParam:"customid",
      keep:["campid","mkcid","siteid","mkevt","mkrid","customid"], remove:["_trkparms","hash"], deeplinkKeys:["url","u","_trkparms"] },
    { id:"cj", host:/(anrdoezrs\.net|tkqlhce\.com|dpbolvw\.net|kqzyfj\.com|jdoqocy\.com)/i, subParam:"sid",
      keep:["sid","url","u"], remove:[], deeplinkKeys:["url","u","destination","dest","dl"] },
    { id:"awin", host:/(go\.awin\.link|awin1\.com|prf\.hn|shareasale\.com)/i, subParam:"clickref",
      keep:["clickref","l","p","d","u"], remove:[], deeplinkKeys:["u","url","destination","dest","dl","d","l","p"] },
    { id:"impact", host:/(impactradius|impactradius-event|impact\.com)/i, subParam:"subId",
      keep:["subId","clickId","campaignId","partnerId","mediaPartnerId"], remove:[], deeplinkKeys:["url","u","destination","dest","dl"] },
    { id:"rakuten", host:/(linksynergy\.com|rakutenmarketing\.com|rakutenadvertising\.com)/i, subParam:"u1",
      keep:["u1","id","mid","murl"], remove:[], deeplinkKeys:["murl","url","u","destination","dest","dl"] },
    { id:"clickbank", host:/hop\.clickbank\.net/i, subParam:"tid",
      keep:["tid","affiliate","vendor","hop"], remove:[], deeplinkKeys:["u","url"] },
    { id:"general", host:/.*/i, subParam:"subid",
      keep:["tag","aff_id","ref","ref_id","clickid","aff","affiliate","pid","aid","campaign","adgroup","subid","sid"], remove:[], deeplinkKeys:["url","u","destination","dest","dl"] },
  ];
  const GLOBAL_REMOVE = [
    "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
    "fbclid","gclid","ttclid","yclid","msclkid","icid","scid","mc_eid","mc_cid","_hsmi","_hsenc","_branch_match_id"
  ];
  const SHORTENER_HOSTS = /(^|\.)((bit\.ly)|(t\.co)|(goo\.gl)|(tinyurl\.com)|(ow\.ly)|(buff\.ly)|(is\.gd)|(cutt\.ly)|(rebrand\.ly)|(lnkd\.in)|(t\.ly)|(s\.id)|(shorturl\.at)|(amzn\.to))$/i;

  const PLACEMENT_NOTES = {
    youtube_desc: "Links are clickable in the description; pin a comment with the same link.",
    youtube_pinned: "Pinned comment is visible on mobile; include a short call-to-action.",
    ig_bio: "Links in captions are NOT clickable; put the link in the bio or use story link sticker.",
    ig_story: "Use the 'Link' sticker; URLs are clickable via sticker only.",
    tiktok_bio: "Only 1 bio link is clickable; consider Link-in-Bio tools if needed.",
    tiktok_desc: "Links in video descriptions are usually NOT clickable; push bio link/QR.",
    twitter_post: "Clickable link; avoid overly long parameters; use one canonical link per tweet.",
    facebook_post: "Clickable; preview sometimes caches—update OG tags if needed.",
    linkedin_post: "Clickable; first link often becomes preview; keep it clean.",
    pinterest_pin: "Single destination URL; keep it short and consistent.",
    newsletter_aug: "Most email clients make URLs clickable; avoid tracking bloat to reduce spam flags.",
    reddit_post: "Clickable in many subs; follow subreddit rules about affiliate disclosure.",
    blog_article: "Use canonical product URLs and consistent SubIDs per placement."
  };

  // ======= Modal detach/attach for FS overlay focus (existing) =======
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

  // ======= Utils =======
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
  function readAffCredits(){
    try { return Math.max(0, Number(localStorage.getItem(AFF_CREDITS_KEY) || 0)); } catch { return 0; }
  }
  function writeAffCredits(n){
    try { localStorage.setItem(AFF_CREDITS_KEY, String(Math.max(0, n|0))); } catch {}
    if (affCreditsBadge) affCreditsBadge.textContent = 'AFF: ' + readAffCredits();
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
    for (const pref of TRACK_PREFIX){ if (k.startsWith(pref)) return true; }
    return false;
  }
  function normalizeUrlInput(raw){
    let str = (raw || '').trim();
    if (!str) return '';
    if (!/^https?:\/\//i.test(str)){ str = 'https://' + str; }
    return str;
  }
  function tryParseURL(val){
    try { return new URL(val); } catch { return null; }
  }

  function cleanURL(input, opts){
    const normalized = normalizeUrlInput(input);
    const u0 = tryParseURL(normalized);
    if (!u0){ return { ok:false, before: input, after:'', changed:false, reason: 'Invalid URL' }; }
    const u = new URL(u0.href);
    if (opts.forceHttps && u.protocol === 'http:'){ u.protocol = 'https:'; }
    const sp = u.searchParams;

    if (opts.keepParams){
      const toDelete = [];
      for (const [key] of sp.entries()){ if (isTrackingKey(key)) toDelete.push(key); }
      for (const k of toDelete) sp.delete(k);
    } else {
      const toDelete = [];
      for (const [key] of sp.entries()){
        const k = key.toLowerCase();
        const keep = ALLOW_WHEN_STRICT.has(k);
        if (!keep) toDelete.push(key);
      }
      for (const [key] of sp.entries()){ if (isTrackingKey(key)) toDelete.push(key); }
      [...new Set(toDelete)].forEach(k => sp.delete(k));
    }
    u.search = sp.toString();
    const before = u0.href;
    const after  = u.href;
    return { ok:true, before, after, changed: before !== after };
  }

  function unlockProUI(){
    isPro = true;
    try { localStorage.setItem(PRO_KEY, '1'); } catch {}
    document.documentElement.classList.add('is-pro');
    updateQuotaUI();
    const batch = document.querySelector('.batch.pro-locked');
    if (batch) batch.classList.remove('pro-locked');
    try { closePro(); } catch {}
    showStatus('Pro unlocked. Enjoy!', 'ok');
  }

  // Initial UI state
  isPro = (localStorage.getItem(PRO_KEY) === '1');
  if (isPro) document.documentElement.classList.add('is-pro');
  updateQuotaUI();
  if (isPro) { const b = document.querySelector('.batch.pro-locked'); if (b) b.classList.remove('pro-locked'); }
  writeAffCredits(readAffCredits()); // refresh badge
  showStatus('Ready.', 'ok');

  // === SINGLE CLEAN ===
  cleanBtn.addEventListener('click', () => {
    const leftMs = cooldownLeftMs();
    if (leftMs > 0){ showStatus(`Please wait ${Math.ceil(leftMs/1000)}s before the next clean.`, 'warn'); return; }
    if (!isPro && remainingQuota() <= 0){ showStatus('Free limit reached for today.', 'warn'); return; }
    const raw = urlIn.value;
    if (!raw.trim()){ showStatus('Please paste a URL to clean.', 'err'); return; }

    const res = cleanURL(raw, { forceHttps: !!forceHttps.checked, keepParams: !!keepParams.checked });
    if (!res.ok){ showStatus('Unesi validan URL (npr. https://example.com).', 'err'); urlOut.value = ''; return; }

    urlOut.value = res.after;
    showStatus(res.changed ? 'Cleaned ✓ tracking junk removed.' : 'Already clean · nothing to remove.', res.changed ? 'ok' : 'warn');

    if (!isPro) { writeLastCleanTs(Date.now()); incrementQuota(); }
  });

  resetBtn.addEventListener('click', () => { urlIn.value=''; urlOut.value=''; showStatus('Reset.', 'ok'); updateQuotaUI(); });

  copyBtn.addEventListener('click', async () => {
    const val = urlOut.value.trim();
    if (!val){ showStatus('Nothing to copy yet.', 'err'); return; }
    try { await navigator.clipboard.writeText(val); showStatus('Copied to clipboard.', 'ok'); }
    catch { showStatus('Copy failed. Select and copy manually.', 'err'); }
  });

  openBtn.addEventListener('click', () => {
    const val = urlOut.value.trim();
    if (!val){ showStatus('Nothing to open yet.', 'err'); return; }
    window.open(val, '_blank', 'noopener,noreferrer');
  });

  // === BATCH CLEAN (Pro) ===
  function autoResizeBatch(){
    if (!batchIn) return;
    batchIn.style.height = 'auto';
    const max = Math.min(600, batchIn.scrollHeight);
    batchIn.style.height = Math.max(120, max) + 'px';
  }
  function getBatchLines(){
    return (batchIn?.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  function handleBatchClean(){
    if (!isPro) { openPro(); showStatus('Batch mode is a Pro feature.', 'warn'); return; }
    const lines = getBatchLines();
    if (!lines.length){ showStatus('Paste 1+ URLs (one per line) to clean.', 'err'); return; }
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
    if (!isPro) { openPro(); showStatus('Batch export is a Pro feature.', 'warn'); return; }
    const lines = getBatchLines();
    if (!lines.length){ showStatus('Nothing to export. Paste URLs first.', 'err'); return; }
    const opts = { forceHttps: !!forceHttps.checked, keepParams: !!keepParams.checked };
    const rows = [['original','cleaned','changed']];
    lines.forEach(l => {
      const r = cleanURL(l, opts);
      if (r.ok){ rows.push([r.before, r.after, String(r.changed)]); }
      else { rows.push([l, l, 'false']); }
    });
    const csv = rows.map(row => row.map(v => {
      const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }).join(',')).join('\n');

    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    const ts = new Date(); const pad = n => String(n).padStart(2,'0');
    const fname = `cleaned-links-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.csv`;
    a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    showStatus(`Exported ${lines.length} URLs to CSV.`, 'ok');
  }
  if (batchIn){ batchIn.addEventListener('input', autoResizeBatch); window.addEventListener('load', autoResizeBatch); }
  if (batchCleanBtn) batchCleanBtn.addEventListener('click', handleBatchClean);
  if (batchExportBtn) batchExportBtn.addEventListener('click', handleBatchExport);

  // === SMT HELPERS ===
  function normalizeChannel(label){
    let s = (label||'').toLowerCase().trim();
    s = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'') : s; // strip diacritics
    s = s.replace(/[^a-z0-9\-_]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
    if (s.length > 24) s = s.slice(0,24);
    return s;
  }
  function detectNetwork(u){
    try{
      const host = new URL(u).hostname;
      for (const n of NETWORKS){ if (n.host.test(host)) return n.id; }
    }catch{}
    return 'unknown';
  }
  function getNetworkRecord(u){
    const id = detectNetwork(u);
    return NETWORKS.find(n => n.id === id) || NETWORKS[NETWORKS.length-1];
  }
  function canonicalizeIfKnown(u){
    try{
      const url = new URL(u);
      const rec = getNetworkRecord(u);
      if (rec.id === 'amazon'){
        // Try to reduce to /dp/ASIN
        const m1 = url.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
        const m2 = url.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
        const asin = (m1 && m1[1]) || (m2 && m2[1]) || null;
        if (asin){
          url.pathname = `/dp/${asin}`;
          // strip extra path segments
          url.searchParams.forEach((_,k) => {}); // noop, keep handled later
        }
        return url.href;
      }
      return url.href;
    }catch{ return u; }
  }
  function keepAffiliateParams(u, rec, keepUTMs){
    try{
      const url = new URL(u);
      const sp = url.searchParams;
      // strip global junk
      for (const k of GLOBAL_REMOVE){ if (!keepUTMs && sp.has(k)) sp.delete(k); }
      // strip tracking prefixes
      const toDel = [];
      for (const [k] of sp){ if (!keepUTMs && /^utm_/i.test(k)) toDel.push(k); }
      toDel.forEach(k => sp.delete(k));
      // remove per-network garbage
      for (const k of (rec.remove||[])){ if (sp.has(k)) sp.delete(k); }
      // ensure keep list present (we don't force add values here)
      url.search = sp.toString();
      return url.href;
    }catch{ return u; }
  }
  function applySubId(u, rec, channelCode){
    try{
      const url = new URL(u);
      // If deeplink param exists, unwrap it
      const sp = url.searchParams;
      for (const key of (rec.deeplinkKeys||[])){
        if (sp.has(key)){
          const val = sp.get(key);
          try{
            const inner = new URL(val);
            // Replace to inner URL, carry on
            u = inner.href;
          }catch{/* not a URL */}
          break;
        }
      }
      const fresh = new URL(u);
      const sp2 = fresh.searchParams;
      // If general and subid already present, fallback to 'sid'
      let subKey = rec.subParam || 'subid';
      if (rec.id === 'general' && sp2.has('subid')) subKey = 'sid';
      sp2.set(subKey, channelCode);
      fresh.search = sp2.toString();
      return { url: fresh.href, subParam: subKey };
    }catch{
      return { url: u, subParam: rec.subParam || 'subid' };
    }
  }
  function buildMatrix(baseUrls, channels, keepUTMs){
    const rows = [];
    let idx = 0;
    for (const raw of baseUrls){
      const cleaned = cleanURL(raw, { forceHttps: !!forceHttps.checked, keepParams: !!keepParams.checked });
      const base = cleaned.ok ? cleaned.after : normalizeUrlInput(raw);
      const canonical = canonicalizeIfKnown(base);
      const rec = getNetworkRecord(canonical);
      const preserved = keepAffiliateParams(canonical, rec, !!keepUTMs);
      const host = (()=>{ try{ return new URL(preserved).hostname; }catch{ return ''; } })();
      const shortWarn = SHORTENER_HOSTS.test(host) ? 'SHORTENER' : '';
      for (const chRaw of channels){
        const ch = normalizeChannel(chRaw);
        if (!ch) continue;
        const applied = applySubId(preserved, rec, ch);
        const noteBits = [];
        if (rec.id === 'amazon' && /\/gp\/product/i.test(canonical)) noteBits.push('AMAZON_CANONICALIZED');
        if (!keepUTMs) noteBits.push('UTM_REMOVED');
        if (shortWarn) noteBits.push(shortWarn);
        const placeNote = PLACEMENT_NOTES[ch]; if (placeNote) noteBits.push(placeNote);
        rows.push({
          index: ++idx,
          base_url: preserved,
          network: rec.id,
          channel_code: ch,
          subid_param: applied.subParam,
          final_url: applied.url,
          notes: noteBits.join(' · ')
        });
      }
    }
    return rows;
  }
  function downloadCsv(rows){
    const header = ["index","base_url","network","channel_code","subid_param","final_url","notes"];
    const csv = [header].concat(rows.map(r => [
      r.index, r.base_url, r.network, r.channel_code, r.subid_param, r.final_url, r.notes||""
    ])).map(row => row.map(v => {
      const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    }).join(',')).join('\n');

    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    const ts = new Date(); const pad = n => String(n).padStart(2,'0');
    const fname = `subid-matrix-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.csv`;
    a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  // === SMT UI handlers ===
  function getLinesFromTextarea(t){ return (t?.value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
  function smtAnalyze(){
    if (!smtEnable?.checked){ smtPreview.textContent = 'SubID Matrix is disabled.'; return; }
    const urls = getLinesFromTextarea(batchIn || {value:''});
    const chs  = getLinesFromTextarea(channelsIn);
    if (!urls.length){ showStatus('Paste URLs in Batch section first.', 'err'); return; }
    if (!chs.length){ showStatus('Add at least one channel.', 'err'); return; }
    const rows = buildMatrix(urls, chs, !!keepUtms?.checked);
    const sample = rows.slice(0, Math.min(10, rows.length));
    const lines = [];
    lines.push(`Detected rows: ${rows.length}`);
    if (sample.length){
      lines.push('');
      lines.push('Preview (first rows):');
      for (const r of sample){
        lines.push(`#${r.index}  [${r.network}]  ${r.channel_code}  (${r.subid_param})`);
        lines.push(`  → ${r.final_url}`);
      }
    }
    smtPreview.textContent = lines.join('\n');
    showStatus(`Analyze ready • ${rows.length} rows`, 'ok');
  }
  function ensureAffCredit(){
    const n = readAffCredits();
    if (n > 0) return true;
    showStatus('No affiliate CSV credits. Click “Buy credits”.', 'warn');
    return false;
  }
  function smtExport(){
    if (!smtEnable?.checked){ showStatus('Enable SubID Matrix first.', 'err'); return; }
    const urls = getLinesFromTextarea(batchIn || {value:''});
    const chs  = getLinesFromTextarea(channelsIn);
    if (!urls.length){ showStatus('Paste URLs in Batch section first.', 'err'); return; }
    if (!chs.length){ showStatus('Add at least one channel.', 'err'); return; }
    if (!ensureAffCredit()) return;

    const rows = buildMatrix(urls, chs, !!keepUtms?.checked);
    if (!rows.length){ showStatus('Nothing to export.', 'err'); return; }

    downloadCsv(rows);
    writeAffCredits(readAffCredits()-1);
    showStatus(`SubID CSV exported • –1 credit • ${rows.length} rows`, 'ok');
  }

  if (smtAnalyzeBtn) smtAnalyzeBtn.addEventListener('click', smtAnalyze);
  if (smtExportBtn)  smtExportBtn.addEventListener('click', smtExport);
  if (buyAffBtn){
    buyAffBtn.addEventListener('click', async ()=> {
      try{
        const fs = await waitForFS();
        registerFSEvents(fs);
        try{ fs.builder.reset(); }catch{}
        // Open FS popup with small bundle; user može promeniti u checkoutu
        fs.builder.add('aff5'); // preporuka (5 kredita)
        fs.builder.checkout();
      }catch(e){
        console.warn(e);
        showStatus('Checkout is loading… please try again in a moment.', 'warn');
      }
    });
  }

  // === Pro modal open/close ===
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

  // === FastSpring ===
  async function waitForFS(ms=2000){
    const t0 = Date.now();
    while (!window.fastspring || !window.fastspring.builder){
      if (Date.now()-t0 > ms) throw new Error('FastSpring not loaded');
      await new Promise(r => setTimeout(r, 25));
    }
    return window.fastspring;
  }
  function registerFSEvents(fs){
    if (!fs || !fs.builder || !fs.builder.on) return;
    // Unlock Pro on Pro products; add AFF credits on AFF products
    const handler = (evt) => {
      try{
        const e = evt || {};
        const items = (e.items || e.data?.items || e.events?.[0]?.data?.items) || [];
        for (const it of items){
          const path = (it && (it.path || it.product || it.sku || it.display || it.id)) || '';
          const sku = String(path).toLowerCase();
          if (/^cslpro$/.test(sku)) {
            unlockProUI();
          } else if (/^aff1$/.test(sku)) {
            writeAffCredits(readAffCredits()+1);
          } else if (/^aff5$/.test(sku)) {
            writeAffCredits(readAffCredits()+5);
          } else if (/^aff20$/.test(sku)) {
            writeAffCredits(readAffCredits()+20);
          }
        }
        // Fallback: if no items parsed but order completed, don't change Pro; credits unchanged
        if (affCreditsBadge) affCreditsBadge.textContent = 'AFF: ' + readAffCredits();
      }catch{}
    };
    [
      'purchased','completed','complete','order.completed','checkout.completed','subscription.activated'
    ].forEach(name => { try { fs.builder.on(name, handler); } catch {} });
  }

  // Pro checkout button (explicit Pro)
  if (upgradeProBtn){
    const trigger = async (e)=>{
      try{ e.preventDefault(); e.stopPropagation(); }catch{}
      closePro(); hardDetachModal();
      try{
        const fs = await waitForFS();
        registerFSEvents(fs);
        try{ fs.builder.reset(); }catch{}
        fs.builder.add('cslpro');
        fs.builder.checkout();
      }catch(err){
        console.warn(err);
        showStatus('Checkout is loading… please try again in a moment.', 'warn');
      }
    };
    upgradeProBtn.addEventListener('pointerdown', trigger, {capture:true});
    upgradeProBtn.addEventListener('mousedown',   trigger, {capture:true});
    upgradeProBtn.addEventListener('click',       trigger, {capture:true});
  }

  // FS popup closed (fallback) — ne menjamo Pro ili AFF osim ako FS eventovi to jave
  window.onFSPopupClosed = function(){
    reattachModal();
  };

  // Try to hook FS if it loads later
  (async () => { try { const fs = await waitForFS(6000); registerFSEvents(fs); } catch {} })();

  // Ghost batch → Pro modal
  const ghostHit = (e) => {
    if (!isPro) { e.preventDefault(); openPro(); showStatus('Batch mode is a Pro feature.', 'warn'); }
  };
  if (batchIn) batchIn.addEventListener('focus', ghostHit);
  if (batchCleanBtn) batchCleanBtn.addEventListener('click', ghostHit);
  if (batchExportBtn) batchExportBtn.addEventListener('click', ghostHit);

  // QoL: Ctrl+Enter to clean
  urlIn.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter'){ cleanBtn.click(); } });

})();
