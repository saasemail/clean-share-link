// SubID Matrix — ultra-clean table preview (one full row, others masked). Credits + FastSpring intact.

// 1) TOOLTIP INIT — potpuno izolovan, radi čak i ako kasnije nešto pukne
(function setupInfoTooltipsIsolated(){
  try{
    let tipEl = null, currentBtn = null;

    const sY = ()=> window.scrollY ?? document.documentElement.scrollTop ?? 0;
    const sX = ()=> window.scrollX ?? document.documentElement.scrollLeft ?? 0;

    function ensureTip(){
      if (tipEl) return tipEl;
      tipEl = document.createElement('div');
      tipEl.className = 'tip-pop';
      tipEl.style.display = 'none';
      document.body.appendChild(tipEl);
      return tipEl;
    }
    function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

    function showTip(btn){
      const msg = btn.getAttribute('data-tip') || '';
      const r = btn.getBoundingClientRect();
      const pad = 8;
      const t = ensureTip();
      t.textContent = msg;
      t.style.visibility = 'hidden';
      t.style.display = 'block';

      const tw = t.offsetWidth;
      const th = t.offsetHeight;

      // primarno: ispod, levo poravnato uz dugme
      let top  = sY() + r.bottom + pad;
      let left = sX() + r.left;

      // ako nema mesta ispod -> iznad
      if (top + th > sY() + window.innerHeight - 4){
        top = sY() + r.top - th - pad;
      }

      // uklopi u viewport
      left = clamp(left, sX() + 8, sX() + window.innerWidth - tw - 8);

      t.style.top  = `${top}px`;
      t.style.left = `${left}px`;
      t.style.visibility = 'visible';
      currentBtn = btn;
    }
    function hideTip(){
      if (tipEl){ tipEl.style.display = 'none'; }
      currentBtn = null;
    }

    function bind(btn){
      // eksplicitno ukini behavior <label> roditelja
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        if (currentBtn === btn) { hideTip(); return; }
        showTip(btn);
      });
      btn.addEventListener('keydown', (e)=>{
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); e.stopPropagation();
          if (currentBtn === btn) { hideTip(); return; }
          showTip(btn);
        }
      });
    }

    // zakači POSLE što je DOM gotov (za slučaj da je script u <head>)
    const ready = () => {
      document.querySelectorAll('.i-tip').forEach(bind);
      document.addEventListener('click', hideTip);
      document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') hideTip(); });
      window.addEventListener('scroll', hideTip, {passive:true});
      window.addEventListener('resize', hideTip);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ready, {once:true});
    } else {
      ready();
    }
  }catch(e){
    // ništa — tooltip je “nice to have”
    console.warn('Tooltip init error:', e);
  }
})();

// 2) OSTATak APLIKACIJE (ne diramo sem malih defenzivnih try/catch)
(function(){
  const el = (id) => document.getElementById(id);

  // Elements
  const urlsIn       = el('urlsIn');
  const channelsIn   = el('channelsIn');
  const keepUtms     = el('keepUtms');
  const showAll      = el('showAll');
  const analyzeBtn   = el('smtAnalyzeBtn');
  const exportBtn    = el('smtExportBtn');
  const buyAffBtn    = el('buyAffBtn');
  const status       = el('status');
  const affBadge     = el('affCredits');

  const smtSummary   = el('smtSummary');
  const smtHint      = el('smtHint');
  const smtTbody     = el('smtTbody');

  // Credits
  const AFF_CREDITS_KEY = 'csl_aff_credits';
  function readAff(){ try{ return Math.max(0, Number(localStorage.getItem(AFF_CREDITS_KEY)||0)); }catch{ return 0; } }
  function writeAff(n){ try{ localStorage.setItem(AFF_CREDITS_KEY, String(Math.max(0, n|0))); }catch{}; if(affBadge) affBadge.textContent='AFF: '+readAff(); }
  writeAff(readAff()); // refresh UI

  // Helpers
  function showStatus(t, kind){ if(!status) return; status.textContent=t||''; status.className='status'+(kind?(' '+kind):''); }
  function getLines(textarea){ return (textarea?.value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
  function normalizeUrlInput(raw){ let s=(raw||'').trim(); if(!s) return ''; if(!/^https?:\/\//i.test(s)) s='https://'+s; return s; }

  // Comment stripping for URLs
  function stripUrlComment(line){
    let s = (line || '').trim();
    s = s.replace(/\s*\([^()]*\)\s*$/,''); // (comment)
    s = s.replace(/\s+#.*$/,'');           // #comment
    s = s.replace(/\s\/\/.*$/,'');         // //comment (not scheme)
    s = s.split(/\s+/)[0] || '';
    return s.trim();
  }
  function getUrlLines(){
    return (urlsIn?.value||'')
      .split(/\r?\n/).map(stripUrlComment).map(s=>s.trim()).filter(Boolean);
  }

  // Networks
  const NETWORKS = [
    { id:"amazon", host:/(^|\.)amazon\./i, subParam:"ascsubtag", keep:["tag","ascsubtag"],
      remove:["qid","sr","ref","smid","spIA","keywords","_encoding"], deeplinkKeys:[], required:["tag"], label:"Amazon" },
    { id:"ebay", host:/(^|\.)ebay\./i, subParam:"customid", keep:["campid","mkcid","siteid","mkevt","mkrid","customid"],
      remove:["_trkparms","hash"], deeplinkKeys:["url","u","_trkparms"], label:"eBay" },
    { id:"cj", host:/(anrdoezrs\.net|tkqlhce\.com|dpbolvw\.net|kqzyfj\.com|jdoqocy\.com)/i, subParam:"sid",
      keep:["sid","url","u"], remove:[], deeplinkKeys:["url","u","destination","dest","dl"], label:"CJ" },
    { id:"awin", host:/(go\.awin\.link|awin1\.com|prf\.hn|shareasale\.com)/i, subParam:"clickref",
      keep:["clickref","l","p","d","u"], remove:[], deeplinkKeys:["u","url","destination","dest","dl","d","l","p"], label:"Awin" },
    { id:"impact", host:/(impactradius|impactradius-event|impact\.com)/i, subParam:"subId",
      keep:["subId","clickId","campaignId","partnerId","mediaPartnerId"], remove:[], deeplinkKeys:["url","u","destination","dest","dl"], label:"Impact" },
    { id:"rakuten", host:/(linksynergy\.com|rakutenmarketing\.com|rakutenadvertising\.com)/i, subParam:"u1",
      keep:["u1","id","mid","murl"], remove:[], deeplinkKeys:["murl","url","u","destination","dest","dl"], label:"Rakuten" },
    { id:"clickbank", host:/hop\.clickbank\.net/i, subParam:"tid", keep:["tid","affiliate","vendor","hop"], remove:[], deeplinkKeys:["u","url"], label:"ClickBank" },
    { id:"general", host:/.*/i, subParam:"subid",
      keep:["tag","aff_id","ref","ref_id","clickid","aff","affiliate","pid","aid","campaign","adgroup","subid","sid"], remove:[], deeplinkKeys:["url","u","destination","dest","dl"], label:"General" },
  ];
  const GLOBAL_REMOVE = [
    "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
    "fbclid","gclid","ttclid","yclid","msclkid","icid","scid","mc_eid","mc_cid","_hsmi","_hsenc","_branch_match_id"
  ];
  const SHORTENER_HOSTS = /(^|\.)((bit\.ly)|(t\.co)|(goo\.gl)|(tinyurl\.com)|(ow\.ly)|(buff\.ly)|(is\.gd)|(cutt\.ly)|(rebrand\.ly)|(lnkd\.in)|(t\.ly)|(s\.id)|(shorturl\.at)|(amzn\.to))$/i;

  function detectNetwork(u){
    try{ const host = new URL(u).hostname; for(const n of NETWORKS){ if(n.host.test(host)) return n.id; } }catch{}
    return 'unknown';
  }
  function netRecord(u){ const id=detectNetwork(u); return NETWORKS.find(n=>n.id===id)||NETWORKS[NETWORKS.length-1]; }

  // Cleaning
  function canonicalizeAmazon(url){
    const m1 = url.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
    const m2 = url.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
    const asin = (m1 && m1[1]) || (m2 && m2[1]) || null;
    if (asin) url.pathname = `/dp/${asin}`;
  }
  function keepAffiliateParams(u, rec, keepUTMs){
    try{
      const url = new URL(u);
      const sp = url.searchParams;
      if (!keepUTMs){
        for (const k of GLOBAL_REMOVE){ if (sp.has(k)) sp.delete(k); }
        const kill=[]; for(const [k] of sp){ if(/^utm_/i.test(k)) kill.push(k); }
        kill.forEach(k=>sp.delete(k));
      }
      for (const k of (rec.remove||[])){ if (sp.has(k)) sp.delete(k); }
      url.search = sp.toString(); return url.href;
    }catch{ return u; }
  }
  function unwrapDeeplink(u, rec){
    try{
      const url = new URL(u), sp = url.searchParams;
      for(const key of (rec.deeplinkKeys||[])){
        if(sp.has(key)){
          const val = sp.get(key);
          try{ const inner = new URL(val); return inner.href; }catch{}
        }
      }
      return u;
    }catch{ return u; }
  }
  function applySubId(u, rec, channelCode){
    try{
      const base = unwrapDeeplink(u, rec);
      const url = new URL(base);
      const sp = url.searchParams;
      let key = rec.subParam || 'subid';
      if (rec.id==='general' && sp.has('subid')) key='sid';
      sp.set(key, channelCode);
      url.search = sp.toString();
      return { href:url.href, key };
    }catch{ return { href:u, key:(rec.subParam||'subid') }; }
  }

  // Matrix
  function buildMatrix(baseUrls, channels, keepUTMs){
    const rows=[]; let i=0;
    for (const raw of baseUrls){
      const init = normalizeUrlInput(raw);
      let urlObj; try{ urlObj=new URL(init);}catch{continue;}
      const rec = NETWORKS.find(n=>n.host.test(new URL(init).hostname)) || NETWORKS[NETWORKS.length-1];
      if (rec.id==='amazon') canonicalizeAmazon(urlObj);
      let preserved = keepAffiliateParams(urlObj.href, rec, !!keepUTMs);
      const host = (()=>{ try{ return new URL(preserved).hostname; }catch{ return ''; } })();
      const shortWarn = SHORTENER_HOSTS.test(host) ? 'SHORTENER' : '';

      for (const chRaw of channels){
        const ch = normalizeChannel(chRaw); if(!ch) continue;
        const { href, key } = applySubId(preserved, rec, ch);
        const noteBits=[];
        if (rec.id==='amazon' && /\/gp\/product/i.test(init)) noteBits.push('AMAZON_CANONICALIZED');
        if (!keepUTMs) noteBits.push('UTM_REMOVED');
        if (shortWarn) noteBits.push(shortWarn);
        rows.push({
          index: ++i,
          base_url: preserved,
          network: rec.id,
          network_label: rec.label || rec.id,
          channel_code: ch,
          subid_param: key,
          final_url: href,
          notes: noteBits.join(' · ')
        });
      }
    }
    return rows;
  }

  // Mask helpers
  function maskPath(path){
    if (!path) return '/';
    if (path.length <= 18) return path;
    const parts = path.split('/');
    const last = parts.pop() || '';
    const shortLast = last.length>10 ? (last.slice(0,6)+'…') : last;
    const base = parts.join('/') || '';
    const shortBase = base.length>8 ? (base.slice(0,8)+'…') : base;
    return (shortBase ? '/'+shortBase : '') + (shortLast ? '/'+shortLast : '/');
  }
  function maskDisplay(u, paramKey, channelCode){
    try{
      const url = new URL(u);
      const host = url.hostname.replace(/^www\./,'');
      const path = maskPath(url.pathname || '/');
      return `${host}${path} · ${paramKey}=<${channelCode}>`;
    }catch{
      return `… · ${paramKey}=<${channelCode}>`;
    }
  }

  // Render ultra-clean table
  const smtTable = document.getElementById('smtTable'); // for copy interception

  function renderSummary(rows, urlCount, chCount){
    if (!smtSummary) return;
    smtSummary.textContent = `Rows: ${rows.length} · URLs: ${urlCount} · Channels: ${chCount}`;
  }
  function renderTable(rows, showAllRows){
    if (!smtTbody || !smtHint) return;
    smtTbody.innerHTML = '';
    if (!rows.length){
      smtTbody.innerHTML = '<tr><td colspan="3" class="dim">No preview.</td></tr>';
      smtHint.style.display = 'none';
      return;
    }
    smtHint.style.display = 'block';

    const limit = showAllRows ? rows.length : Math.min(rows.length, 10);
    let firstShown = false;

    for (let i=0; i<limit; i++){
      const r = rows[i];
      const tr = document.createElement('tr');

      const tdNet = document.createElement('td');
      tdNet.innerHTML = `<span class="badge-net">${r.network_label || r.network}</span>`;

      const tdCh = document.createElement('td');
      tdCh.textContent = r.channel_code;

      const tdRes = document.createElement('td');
      if (!firstShown){
        tdRes.innerHTML = `<code>${r.final_url}</code>`;
        firstShown = true;
      } else {
        tdRes.innerHTML = `<code>${maskDisplay(r.final_url, r.subid_param, r.channel_code)}</code>`;
      }

      tr.appendChild(tdNet); tr.appendChild(tdCh); tr.appendChild(tdRes);
      smtTbody.appendChild(tr);
    }

    if (!showAllRows && rows.length > limit){
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'dim';
      td.textContent = `+${rows.length - limit} more — enable “Show all rows in preview” to expand`;
      tr.appendChild(td);
      smtTbody.appendChild(tr);
    }
  }

  // Analyze / Export
  function analyze(){
    const urls = getUrlLines(), ch = getLines(channelsIn);
    if (!urls.length) { showStatus('Add URLs.', 'err'); return; }
    if (!ch.length)   { showStatus('Add channels.', 'err'); return; }
    const rows = buildMatrix(urls, ch, !!keepUtms?.checked);
    renderSummary(rows, urls.length, ch.length);
    renderTable(rows, !!(showAll && showAll.checked));
    showStatus('Analyze ready.', 'ok');
  }

  function ensureCredit(){
    const n = readAff(); if (n>0) return true;
    showStatus(); return false;
  }

  function downloadCsv(rows){
    const header = ["index","base_url","network","channel_code","subid_param","final_url","notes"];
    const csv = [header].concat(rows.map(r=>[
      r.index,r.base_url,r.network,r.channel_code,r.subid_param,r.final_url,r.notes||""
    ])).map(row=>row.map(v=>{
      const s=String(v??''); return /[",\n]/.test(s)?('"'+s.replace(/"/g,'""')+'"'):s;
    }).join(',')).join('\n');

    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    const ts = new Date(); const pad=n=>String(n).padStart(2,'0');
    a.download = `subid-matrix-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.csv`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  function exportCsv(){
    const urls = getUrlLines(), ch = getLines(channelsIn);
    if (!urls.length) { showStatus('Add URLs.', 'err'); return; }
    if (!ch.length)   { showStatus('Add channels.', 'err'); return; }
    if (!ensureCredit()) return;
    const rows = buildMatrix(urls, ch, !!keepUtms?.checked);
    if (!rows.length){ showStatus('Nothing to export.', 'err'); return; }
    downloadCsv(rows);
    writeAff(readAff()-1);
    showStatus(`SubID CSV exported • –1 credit • ${rows.length} rows`, 'ok');
  }

  if (analyzeBtn) analyzeBtn.addEventListener('click', analyze);
  if (exportBtn)  exportBtn.addEventListener('click', exportCsv);

  // FastSpring glue (AFF1/AFF5/AFF20)
  async function waitForFS(ms=4000){
    const t0=Date.now();
    while(!window.fastspring || !window.fastspring.builder){
      if(Date.now()-t0>ms) throw new Error('FastSpring not loaded');
      await new Promise(r=>setTimeout(r,25));
    }
    return window.fastspring;
  }
  function registerFSEvents(fs){
    if (!fs || !fs.builder || !fs.builder.on) return;
    const handler = (evt)=>{
      try{
        const items = (evt.items || evt.data?.items || evt.events?.[0]?.data?.items) || [];
        for (const it of items){
          const sku = String(it.path || it.product || it.sku || it.display || it.id || '').toLowerCase();
          if (/^aff1$/.test(sku))  writeAff(readAff()+1);
          if (/^aff5$/.test(sku))  writeAff(readAff()+5);
          if (/^aff20$/.test(sku)) writeAff(readAff()+20);
        }
      }catch{}
    };
    ['purchased','completed','complete','order.completed','checkout.completed'].forEach(n=>{ try{ fs.builder.on(n, handler); }catch{} });
  }
  if (buyAffBtn){
    buyAffBtn.addEventListener('click', async ()=>{
      try{
        const fs = await waitForFS();
        registerFSEvents(fs);
        try{ fs.builder.reset(); }catch{}
        fs.builder.add('aff5');
        fs.builder.checkout();
      }catch(e){ console.warn(e); showStatus('Checkout is loading… try again shortly.', 'warn'); }
    });
  }
  (async()=>{ try{ const fs=await waitForFS(6000); registerFSEvents(fs);}catch{} })();

  // Channel normalize
  function normalizeChannel(label){
    let s=(label||'').toLowerCase().trim();
    s = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'') : s;
    s = s.replace(/[^a-z0-9\-_]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
    if (s.length>24) s=s.slice(0,24);
    return s;
  }

  /* ------------ Anti-copy u preview tabeli (samo 1+2) ------------ */
  (function setupNoCopy(){
    try{
      const tbl = document.getElementById('smtTable');
      if (!tbl) return;
      document.addEventListener('copy', (e)=>{
        try{
          const sel = window.getSelection && window.getSelection();
          if (!sel || sel.isCollapsed) return;
          const node = sel.anchorNode;
          if (node && tbl.contains(node)){
            e.preventDefault();
            const msg = 'Preview is masked. Use Export CSV to get full results.';
            if (e.clipboardData) e.clipboardData.setData('text/plain', msg);
            else if (window.clipboardData) window.clipboardData.setData('Text', msg);
            showStatus('Copy disabled in preview. Export CSV for full results.', 'warn');
          }
        }catch{}
      }, true);
    }catch{}
  })();

})();
