// SubID Matrix Tracker — affiliate-only (grouped preview, example fill, comment stripping)

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
  const useExampleBtn= el('useExampleBtn');
  const status       = el('status');
  const affBadge     = el('affCredits');

  const smtSummary   = el('smtSummary');
  const smtPreview   = el('smtPreview');

  // Credits
  const AFF_CREDITS_KEY = 'csl_aff_credits';
  function readAff(){ try{ return Math.max(0, Number(localStorage.getItem(AFF_CREDITS_KEY)||0)); }catch{ return 0; } }
  function writeAff(n){ try{ localStorage.setItem(AFF_CREDITS_KEY, String(Math.max(0, n|0))); }catch{}; if(affBadge) affBadge.textContent='AFF: '+readAff(); }
  writeAff(readAff()); // refresh UI

  // Helpers
  function showStatus(t, kind){ status.textContent=t||''; status.className='status'+(kind?(' '+kind):''); }
  function getLines(textarea){ return (textarea?.value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
  function normalizeUrlInput(raw){ let s=(raw||'').trim(); if(!s) return ''; if(!/^https?:\/\//i.test(s)) s='https://'+s; return s; }

  // --- Comment stripping for URLs ---
  // - strip trailing "(...)"   - strip " #comment"   - strip " //comment" (not the https://)  - take first token
  function stripUrlComment(line){
    let s = (line || '').trim();
    s = s.replace(/\s*\([^()]*\)\s*$/,'');
    s = s.replace(/\s+#.*$/,'');
    s = s.replace(/\s\/\/.*$/,'');
    s = s.split(/\s+/)[0] || '';
    return s.trim();
  }
  function getUrlLines(){
    return (urlsIn?.value||'')
      .split(/\r?\n/).map(stripUrlComment).map(s=>s.trim()).filter(Boolean);
  }

  // Reference data (networks / junk)
  const NETWORKS = [
    { id:"amazon", host:/(^|\.)amazon\./i, subParam:"ascsubtag", keep:["tag","ascsubtag"],
      remove:["qid","sr","ref","smid","spIA","keywords","_encoding"], deeplinkKeys:[], required:["tag"] },
    { id:"ebay", host:/(^|\.)ebay\./i, subParam:"customid", keep:["campid","mkcid","siteid","mkevt","mkrid","customid"],
      remove:["_trkparms","hash"], deeplinkKeys:["url","u","_trkparms"] },
    { id:"cj", host:/(anrdoezrs\.net|tkqlhce\.com|dpbolvw\.net|kqzyfj\.com|jdoqocy\.com)/i, subParam:"sid",
      keep:["sid","url","u"], remove:[], deeplinkKeys:["url","u","destination","dest","dl"] },
    { id:"awin", host:/(go\.awin\.link|awin1\.com|prf\.hn|shareasale\.com)/i, subParam:"clickref",
      keep:["clickref","l","p","d","u"], remove:[], deeplinkKeys:["u","url","destination","dest","dl","d","l","p"] },
    { id:"impact", host:/(impactradius|impactradius-event|impact\.com)/i, subParam:"subId",
      keep:["subId","clickId","campaignId","partnerId","mediaPartnerId"], remove:[], deeplinkKeys:["url","u","destination","dest","dl"] },
    { id:"rakuten", host:/(linksynergy\.com|rakutenmarketing\.com|rakutenadvertising\.com)/i, subParam:"u1",
      keep:["u1","id","mid","murl"], remove:[], deeplinkKeys:["murl","url","u","destination","dest","dl"] },
    { id:"clickbank", host:/hop\.clickbank\.net/i, subParam:"tid", keep:["tid","affiliate","vendor","hop"], remove:[], deeplinkKeys:["u","url"] },
    { id:"general", host:/.*/i, subParam:"subid",
      keep:["tag","aff_id","ref","ref_id","clickid","aff","affiliate","pid","aid","campaign","adgroup","subid","sid"], remove:[], deeplinkKeys:["url","u","destination","dest","dl"] },
  ];
  const GLOBAL_REMOVE = [
    "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
    "fbclid","gclid","ttclid","yclid","msclkid","icid","scid","mc_eid","mc_cid","_hsmi","_hsenc","_branch_match_id"
  ];
  const SHORTENER_HOSTS = /(^|\.)((bit\.ly)|(t\.co)|(goo\.gl)|(tinyurl\.com)|(ow\.ly)|(buff\.ly)|(is\.gd)|(cutt\.ly)|(rebrand\.ly)|(lnkd\.in)|(t\.ly)|(s\.id)|(shorturl\.at)|(amzn\.to))$/i;
  const PLACEMENT_NOTES = {
    youtube_desc:"Links are clickable in the description; pin a comment with the same link.",
    youtube_pinned:"Pinned comment is visible on mobile; include a short call-to-action.",
    ig_bio:"Links in captions are NOT clickable; put the link in the bio or use story link sticker.",
    ig_story:"Use the 'Link' sticker; URLs are clickable via sticker only.",
    tiktok_bio:"Only 1 bio link is clickable; consider Link-in-Bio tools if needed.",
    tiktok_desc:"Links in video descriptions are usually NOT clickable; push bio link/QR.",
    twitter_post:"Clickable link; avoid overly long parameters; use one canonical link per tweet.",
    facebook_post:"Clickable; preview sometimes caches—update OG tags if needed.",
    linkedin_post:"Clickable; first link often becomes preview; keep it clean.",
    pinterest_pin:"Single destination URL; keep it short and consistent.",
    newsletter_aug:"Most email clients make URLs clickable; avoid tracking bloat to reduce spam flags.",
    reddit_post:"Clickable in many subs; follow subreddit rules about affiliate disclosure.",
    blog_article:"Use canonical product URLs and consistent SubIDs per placement."
  };

  // Normalizers
  function normalizeChannel(label){
    let s=(label||'').toLowerCase().trim();
    s = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g,'') : s;
    s = s.replace(/[^a-z0-9\-_]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
    if (s.length>24) s=s.slice(0,24);
    return s;
  }
  function detectNetwork(u){
    try{ const host = new URL(u).hostname; for(const n of NETWORKS){ if(n.host.test(host)) return n.id; } }catch{}
    return 'unknown';
  }
  function getNetworkRecord(u){ const id=detectNetwork(u); return NETWORKS.find(n=>n.id===id)||NETWORKS[NETWORKS.length-1]; }

  // Cleaning / canon / keep params
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
      const rec = getNetworkRecord(init);
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
        if (PLACEMENT_NOTES[ch]) noteBits.push(PLACEMENT_NOTES[ch]);
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

  // Group + render
  function groupByNetwork(rows){
    const map = new Map();
    for (const r of rows){
      if (!map.has(r.network)) map.set(r.network, []);
      map.get(r.network).push(r);
    }
    return map;
  }

  function renderSummary(rows, urlCount, chCount){
    const map = groupByNetwork(rows);
    const parts = [];
    parts.push(`Rows: ${rows.length} · URLs: ${urlCount} · Channels: ${chCount}`);
    const nets = [];
    for (const [net, arr] of map.entries()){ nets.push(`${net}(${arr.length})`); }
    if (nets.length) parts.push('Networks: ' + nets.join(', '));
    smtSummary.textContent = parts.join('  ·  ');
  }

  function renderGrouped(rows, useAll){
    const map = groupByNetwork(rows);
    smtPreview.innerHTML = '';
    for (const [net, arr] of map.entries()){
      const grp = document.createElement('div'); grp.className='grp';
      const title = document.createElement('div'); title.className='grp-title';
      const h4 = document.createElement('h4'); h4.textContent = `${net} · ${arr.length} rows`;
      const chips = document.createElement('div'); chips.className='chips';
      const chip1 = document.createElement('span'); chip1.className='chip dim'; chip1.textContent='preview';
      const chip2 = document.createElement('span'); chip2.className='chip dim'; chip2.textContent= useAll ? 'all' : 'compact';
      chips.appendChild(chip1); chips.appendChild(chip2);
      title.appendChild(h4); title.appendChild(chips);

      const body = document.createElement('div'); body.className='grp-body';
      const max = useAll ? arr.length : Math.min(2, arr.length);
      for (let i=0; i<max; i++){
        const r = arr[i];
        const line1 = document.createElement('div'); line1.className='row';
        line1.textContent = `#${r.index} (${r.subid_param}) ${r.channel_code}`;
        const line2 = document.createElement('div'); line2.className='row url';
        line2.textContent = `→ ${r.final_url}`;
        body.appendChild(line1); body.appendChild(line2);
      }
      if (!useAll && arr.length > 2){
        const more = document.createElement('div'); more.className='more';
        more.textContent = `(+${arr.length - 2} more — enable "Show all" to expand)`;
        body.appendChild(more);
      }

      grp.appendChild(title); grp.appendChild(body);
      smtPreview.appendChild(grp);
    }
  }

  // CSV
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

  // Analyze / Export
  function analyze(){
    const urls = getUrlLines(), ch = getLines(channelsIn);
    if (!urls.length) { showStatus('Paste affiliate URLs (one per line).', 'err'); return; }
    if (!ch.length)   { showStatus('Add at least one channel.', 'err'); return; }
    const rows = buildMatrix(urls, ch, !!keepUtms?.checked);
    renderSummary(rows, urls.length, ch.length);
    const useAll = !!(showAll && showAll.checked);
    renderGrouped(rows, useAll);
    showStatus('Analyze ready.', 'ok');
  }

  function ensureCredit(){
    const n = readAff(); if (n>0) return true;
    showStatus('No affiliate CSV credits. Click “Buy credits”.', 'warn'); return false;
  }

  function exportCsv(){
    const urls = getUrlLines(), ch = getLines(channelsIn);
    if (!urls.length) { showStatus('Paste affiliate URLs first.', 'err'); return; }
    if (!ch.length)   { showStatus('Add at least one channel.', 'err'); return; }
    if (!ensureCredit()) return;
    const rows = buildMatrix(urls, ch, !!keepUtms?.checked);
    if (!rows.length){ showStatus('Nothing to export.', 'err'); return; }
    downloadCsv(rows);
    writeAff(readAff()-1);
    showStatus(`SubID CSV exported • –1 credit • ${rows.length} rows`, 'ok');
  }

  if (analyzeBtn) analyzeBtn.addEventListener('click', analyze);
  if (exportBtn)  exportBtn.addEventListener('click', exportCsv);

  // Example fill
  if (useExampleBtn){
    useExampleBtn.addEventListener('click', ()=>{
      urlsIn.value = [
        'https://www.amazon.com/gp/product/B08N5WRWNW?tag=yourtag-20&qid=123&sr=2-3&ref=something&utm_source=x',
        'https://amzn.to/3ABCDEF',
        'https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=5338765432&mpre=https%3A%2F%2Fwww.ebay.com%2Fitm%2F1234567890&utm_campaign=test',
        'https://anrdoezrs.net/click-0000000-0000000?url=https%3A%2F%2Fmerchant.com%2Fdeal%3Fsku%3DABC%26utm_source%3Dnewsletter',
        'https://go.awin.link/abc123?u=https%3A%2F%2Fstore.example.com%2Fprod%3Faff_id%3D55%26utm_medium%3Dsocial',
        'https://hop.clickbank.net/?affiliate=myname&vendor=vendorx',
        'https://site.example.com/page?ref=xyz&utm_source=twitter&fbclid=123'
      ].join('\n');
      channelsIn.value = ['youtube_desc','ig_bio','tiktok_bio','newsletter_aug'].join('\n');
      showStatus('Example inserted. Click Analyze.', 'ok');
    });
  }

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
        fs.builder.add('aff5'); // default bundle; user može promeniti u checkoutu
        fs.builder.checkout();
      }catch(e){ console.warn(e); showStatus('Checkout is loading… try again shortly.', 'warn'); }
    });
  }

  // Try hook FS on load
  (async()=>{ try{ const fs=await waitForFS(6000); registerFSEvents(fs);}catch{} })();

})();
