// SubID Matrix — ultra-clean table preview (one full row, others masked). Credits + FastSpring intact.

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
  const smtHint = el('smtHint');
  const smtTbody = el('smtTbody');

  // Pay-per-run session (single export with cap 10/50/100)
  const RUN_SESSION_KEY = 'smt_run_session_v1'; // {cap:number, used:boolean, createdAt:number}
  const SKU_CAP = { smt10:10, smt50:50, smt100:100 };
  const runBadge = document.getElementById('runBadge');
  const buyStarter = document.getElementById('buyStarter');
  const buyPro = document.getElementById('buyPro');
  const buyAgency = document.getElementById('buyAgency');

  function readSession(){
    try{ const o = JSON.parse(localStorage.getItem(RUN_SESSION_KEY)||'null'); return (o&&typeof o.cap==='number')?o:null; }catch{ return null; }
  }
  function writeSession(o){
    try{ localStorage.setItem(RUN_SESSION_KEY, JSON.stringify(o||null)); }catch{}
    updateRunBadge();
  }
  function clearSession(){ try{ localStorage.removeItem(RUN_SESSION_KEY); }catch{} updateRunBadge(); }
  function updateRunBadge(){
    const s = readSession();
    if (!runBadge) return;
    if (!s) runBadge.textContent = 'Session: none';
    else if (s.used) runBadge.textContent = `Session: used (cap ${s.cap})`;
    else runBadge.textContent = `Session: active (cap ${s.cap})`;
  }
  updateRunBadge();
  const smtHint      = el('smtHint');
  const smtTbody     = el('smtTbody');

  // Credits
  const AFF_CREDITS_KEY = 'csl_aff_credits'; // legacy (unused)
  function readAff(){ return 0; }
function writeAff(n){}
// legacy no-op

  // Helpers
  function showStatus(t, kind){ status.textContent=t||''; status.className='status'+(kind?(' '+kind):''); }
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
  function netLabel(id){ return (NETWORKS.find(n=>n.id===id)||{}).label || id; }

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

  function ensureRunSession(urlCount){
      const s = readSession();
      if (!s || s.used){
        showStatus('Purchase a package to export: Starter (10), Pro (50), Agency (100).', 'warn');
        return false;
      }
      if (typeof urlCount === 'number' && urlCount > s.cap){
        showStatus(`Your package covers up to ${s.cap} URLs per run. You entered ${urlCount}.`, 'err');
        return false;
      }
      return true;
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
  if (!ensureRunSession(urls.length)) return;

  const rows = buildMatrix(urls, ch, !!keepUtms?.checked);
  if (!rows.length){ showStatus('Nothing to export.', 'err'); return; }

  downloadCsv(rows);

  const s = readSession();
  if (s) { s.used = true; writeSession(s); }
  showStatus(`SubID CSV exported • session consumed • ${rows.length} rows`, 'ok');
}
)();
