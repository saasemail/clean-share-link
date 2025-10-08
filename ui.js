// SubID Matrix — preview + CSV export + FastSpring checkout glue for pay-per-export
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

  const smtSummary   = el('smtSummary');
  const smtHint      = el('smtHint');
  const smtTbody     = el('smtTbody');

  // Pricing modal
  const pkgModal   = el('pkgModal');
  const pkgClose   = el('pkgClose');
  const pkgStarter = el('pkgStarter');
  const pkgPro     = el('pkgPro');
  const pkgAgency  = el('pkgAgency');

  // Local credits (pay-per-export)
  const AFF_CREDITS_KEY = 'csl_aff_credits';
  const readAff = () => { try{ return Math.max(0, Number(localStorage.getItem(AFF_CREDITS_KEY)||0)); }catch{ return 0; } };
  const writeAff = (n) => { try{ localStorage.setItem(AFF_CREDITS_KEY, String(Math.max(0, n|0))); }catch{} };

  // Helpers
  const showStatus = (t, kind) => { status.textContent=t||''; status.className='status'+(kind?(' '+kind):''); };
  const getLines = (ta) => (ta?.value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const normalizeUrlInput = (raw) => { let s=(raw||'').trim(); if(!s) return ''; if(!/^https?:\/\//i.test(s)) s='https://'+s; return s; };

  function stripUrlComment(line){
    let s = (line || '').trim();
    s = s.replace(/\s*\([^()]*\)\s*$/,''); // (comment)
    s = s.replace(/\s+#.*$/,'');           // #comment
    s = s.replace(/\s\/\/.*$/,'');         // // comment tail
    s = s.split(/\s+/)[0] || '';
    return s.trim();
  }
  function getUrlLines(){
    return (urlsIn?.value||'').split(/\r?\n/).map(stripUrlComment).map(s=>s.trim()).filter(Boolean);
  }

  // Networks + rules (minimal needed for preview/export)
  const NETWORKS = [
    { id:"amazon", host:/(^|\.)amazon\./i, subParam:"ascsubtag", keep:["tag","ascsubtag"],
      remove:["qid","sr","ref","smid","spIA","keywords","_encoding"], deeplinkKeys:[], label:"Amazon" },
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

  const detectNetwork = (u)=>{ try{ const host = new URL(u).hostname; for(const n of NETWORKS){ if(n.host.test(host)) return n.id; } }catch{} return 'unknown'; };
  const netRecord = (u)=>{ const id=detectNetwork(u); return NETWORKS.find(n=>n.id===id)||NETWORKS[NETWORKS.length-1]; };

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

  function buildMatrix(baseUrls, channels, keepUTMs){
    const rows=[]; let i=0;
    for (const raw of baseUrls){
      const init = normalizeUrlInput(raw);
      let urlObj; try{ urlObj=new URL(init);}catch{continue;}
      const rec = netRecord(init);
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
          channel_code: ch,
          subid_param: key,
          final_url: href,
          notes: noteBits.join(' · ')
        });
      }
    }
    return rows;
  }

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

  function renderSummary(rows, urlCount, chCount){
    smtSummary.textContent = `Rows: ${rows.length} · URLs: ${urlCount} · Channels: ${chCount}`;
  }
  function renderTable(rows, showAllRows){
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
      tdNet.innerHTML = `<span class="badge-net">${(NETWORKS.find(n=>n.id===r.network)?.label)||r.network}</span>`;

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

  function analyze(){
    const urls = getUrlLines(), ch = getLines(channelsIn);
    if (!urls.length) { showStatus('Add URLs.', 'err'); return; }
    if (!ch.length)   { showStatus('Add channels.', 'err'); return; }
    const rows = buildMatrix(urls, ch, !!keepUtms?.checked);
    renderSummary(rows, urls.length, ch.length);
    renderTable(rows, !!(showAll && showAll.checked));
    showStatus('Analyze ready.', 'ok');
  }

  // ===== Modal UI =====
  const showPackages = ()=>{ if(pkgModal) pkgModal.style.display='flex'; };
  const hidePackages = ()=>{ if(pkgModal) pkgModal.style.display='none'; };

  function ensureCredit(){
    const n = readAff();
    if (n>0) return true;
    showPackages();
    showStatus('Choose a package to continue.', 'warn');
    return false;
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
    // –1 kredit nakon uspešnog downloada
    writeAff(readAff()-1);
    hidePackages();
    showStatus(`SubID CSV exported • –1 credit • ${rows.length} rows`, 'ok');
  }

  if (analyzeBtn) analyzeBtn.addEventListener('click', analyze);
  if (exportBtn)  exportBtn.addEventListener('click', exportCsv);
  if (buyAffBtn)  buyAffBtn.addEventListener('click', ()=>{ showPackages(); showStatus('Choose a package to continue.', 'warn'); });
  if (pkgClose)   pkgClose.addEventListener('click', hidePackages);
  if (pkgModal)   pkgModal.addEventListener('click', (e)=>{ if(e.target===pkgModal) hidePackages(); });

  // ===== FastSpring glue (ispravka: koristimo "path" + direktni checkout products) =====
  async function waitForFS(ms=8000){
    const t0=Date.now();
    while(!window.fastspring || !window.fastspring.builder){
      if(Date.now()-t0>ms) throw new Error('FastSpring not loaded');
      await new Promise(r=>setTimeout(r,40));
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
          if (/^smt\-starter$/.test(sku) || /^smt\-pro$/.test(sku) || /^smt\-agency$/.test(sku)) {
            // Svaki SMT paket = 1 kredit
            writeAff(readAff()+1);
            showStatus('Purchase completed • +1 credit', 'ok');
            hidePackages();
          }
        }
      }catch{}
    };
    ['purchased','completed','complete','order.completed','checkout.completed'].forEach(n=>{ try{ fs.builder.on(n, handler); }catch{} });
    try{ fs.builder.on('checkout.error', ()=> showStatus('Checkout error — try again.', 'err')); }catch{}
  }

  async function addAndCheckout(sku){
    try{
      const fs = await waitForFS();
      registerFSEvents(fs);

      // Čišćenje korpe (ako postoji)
      try{ fs.builder.reset(); }catch{}

      // VARIJANTA A: dodaj pa otvori
      try{
        fs.builder.add({ path: sku, quantity: 1 }); // <— ispravka: path umesto product
        fs.builder.checkout();
        return;
      }catch{}

      // VARIJANTA B: direktno kroz checkout sa products listom
      try{
        fs.builder.checkout({ products: [{ path: sku, quantity: 1 }] });
        return;
      }catch{}

      showStatus('Checkout is loading… try again shortly.', 'warn');
    }catch(e){
      console.warn(e);
      showStatus('Checkout is loading… try again shortly.', 'warn');
    }
  }

  if (pkgStarter) pkgStarter.addEventListener('click', ()=> addAndCheckout('SMT-STARTER'));
  if (pkgPro)     pkgPro.addEventListener('click',     ()=> addAndCheckout('SMT-PRO'));
  if (pkgAgency)  pkgAgency.addEventListener('click',  ()=> addAndCheckout('SMT-AGENCY'));

  // Pre-subscribe na FS evente čim se skripta pojavi (tiho)
  (async()=>{ try{ const fs=await waitForFS(); registerFSEvents(fs);}catch{} })();

  // Tooltips za “i” (mobilni + desktop)
  (function setupInfoTooltips(){
    let tipEl = null, currentBtn = null;
    const ensureTip = ()=>{ if (tipEl) return tipEl; tipEl = document.createElement('div'); tipEl.className='tip-pop'; tipEl.style.display='none'; tipEl.setAttribute('role','tooltip'); document.body.appendChild(tipEl); return tipEl; };
    const getViewport = ()=>{ const vv=window.visualViewport; return vv?{top:vv.offsetTop||0,left:vv.offsetLeft||0,width:vv.width||window.innerWidth,height:vv.height||window.innerHeight}:{top:0,left:0,width:window.innerWidth,height:window.innerHeight}; };
    const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
    function positionTip(btn){
      const t=ensureTip(); const r=btn.getBoundingClientRect(); const vp=getViewport(); const pad=8;
      t.style.visibility='hidden'; t.style.display='block';
      const tw=t.offsetWidth, th=t.offsetHeight;
      let top = vp.top + r.top - th - pad; if (top < vp.top + 4) top = vp.top + r.bottom + pad;
      let left = vp.left + r.left + (r.width/2) - (tw/2);
      left = clamp(left, vp.left + 8, vp.left + vp.width - tw - 8);
      t.style.top = `${Math.round(top)}px`; t.style.left = `${Math.round(left)}px`; t.style.visibility='visible';
    }
    function showTip(btn){ const t=ensureTip(); t.textContent = btn.getAttribute('data-tip')||''; positionTip(btn); currentBtn=btn; }
    function hideTip(){ if(tipEl){ tipEl.style.display='none'; } currentBtn=null; }
    function toggleTip(e){ e.preventDefault(); e.stopPropagation(); const btn=e.currentTarget; if(currentBtn===btn){ hideTip(); return; } showTip(btn); }
    function bind(btn){ btn.addEventListener('click',toggleTip); btn.addEventListener('touchend',toggleTip,{passive:false}); btn.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' ') toggleTip(e); }); }
    document.querySelectorAll('.i-tip').forEach(bind);
    document.addEventListener('click',(e)=>{ if(tipEl && tipEl.style.display==='block'){ if(e.target===tipEl || tipEl.contains(e.target)) return; hideTip(); }});
    document.addEventListener('touchstart',(e)=>{ if(tipEl && tipEl.style.display==='block'){ if(e.target===tipEl || tipEl.contains(e.target)) return; hideTip(); }},{passive:true});
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') hideTip(); });
    const reposition=()=>{ if(currentBtn && tipEl && tipEl.style.display==='block') positionTip(currentBtn); };
    window.addEventListener('scroll',reposition,{passive:true}); window.addEventListener('resize',reposition);
    if(window.visualViewport){ window.visualViewport.addEventListener('scroll',reposition); window.visualViewport.addEventListener('resize',reposition); }
  })();

  function normalizeChannel(label){
    let s=(label||'').toLowerCase().trim();
    s = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'') : s;
    s = s.replace(/[^a-z0-9\-_]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
    if (s.length>24) s=s.slice(0,24);
    return s;
  }
})();
