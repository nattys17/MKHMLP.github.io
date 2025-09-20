(function(){
  // Weekly Tasks (Mon–Fri, PDT) — single-card layout with inline editor
  // v3: Editor lives inside the same card; visible & actionable only for Keyholder.
  const TZ = 'America/Los_Angeles';

  function ymdInTZ(){
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'
    }).format(new Date());
  }
  function dowInTZ(){
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, weekday:'short'
    }).format(new Date()); // Sun..Sat
  }

  function mondayOfWeekPDT(){
    const ymd = ymdInTZ(); const [Y,M,D] = ymd.split('-').map(Number);
    const temp = new Date(Y, M-1, D);
    const sun0 = (['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(dowInTZ()));
    const offset = (sun0===0) ? 6 : (sun0-1); // days since Monday
    const mon = new Date(temp); mon.setDate(temp.getDate() - offset);
    const yy = mon.getFullYear(), mm = String(mon.getMonth()+1).padStart(2,'0'), dd = String(mon.getDate()).padStart(2,'0');
    return `${yy}-${mm}-${dd}`;
  }
  function weekRangeLabelPDT(){
    const monStr = mondayOfWeekPDT();
    const [y,m,d] = monStr.split('-').map(Number);
    const mon = new Date(y, m-1, d);
    const fri = new Date(y, m-1, d+4);
    const fmt = (dt)=>dt.toLocaleDateString(undefined,{month:'short', day:'numeric'});
    return `${fmt(mon)} – ${fmt(fri)} (PDT)`;
  }
  function todayColIndex(){
    const idxMap = {Mon:0, Tue:1, Wed:2, Thu:3, Fri:4};
    const k = dowInTZ(); return (k in idxMap) ? idxMap[k] : -1;
  }

  function getCfg(){
    const root = document.getElementById('weeklyRoot');
    return {
      REMOTE_URL: (window.REMOTE_URL || (root && root.dataset.remote) || '').trim(),
      TOKEN_KEY:  (window.TOKEN_KEY  || (root && root.dataset.tokenKey) || '').trim(),
      TOKEN_SUB:  (window.TOKEN_SUB  || (root && root.dataset.tokenSub) || '').trim(),
      ROLE_HINT:  (root && root.dataset.role) ? String(root.dataset.role).toLowerCase() : ''
    };
  }
  function getRole(){
    // 1) From a #modeLabel element on the page
    const ml = (document.getElementById('modeLabel')||{}).textContent || '';
    if(ml) {
      const low = ml.trim().toLowerCase();
      if(low.includes('keyholder')) return 'keyholder';
      if(low.includes('locked pet') || low==='sub') return 'sub';
    }
    // 2) data-role on #weeklyRoot
    const cfg = getCfg();
    if(cfg.ROLE_HINT){
      if(cfg.ROLE_HINT==='keyholder' || cfg.ROLE_HINT==='kh' || cfg.ROLE_HINT==='owner') return 'keyholder';
      if(cfg.ROLE_HINT==='sub' || cfg.ROLE_HINT==='pet') return 'sub';
      if(cfg.ROLE_HINT==='viewer' || cfg.ROLE_HINT==='view') return 'viewer';
    }
    // 3) ?role=keyholder in URL
    const qp = new URLSearchParams(location.search).get('role');
    if(qp){
      const v = qp.toLowerCase();
      if(v==='keyholder' || v==='kh' || v==='owner') return 'keyholder';
      if(v==='sub' || v==='pet') return 'sub';
      return 'viewer';
    }
    // 4) window.UI_ROLE override
    if(window.UI_ROLE){
      const v = String(window.UI_ROLE).toLowerCase();
      if(v==='keyholder' || v==='kh' || v==='owner') return 'keyholder';
      if(v==='sub' || v==='pet') return 'sub';
      return 'viewer';
    }
    return 'viewer';
  }

  async function fetchShared(url){
    const res = await fetch(url + '?v=' + Date.now(), {cache:'no-store'});
    if(!res.ok) throw new Error('GET failed: HTTP '+res.status);
    return res.json();
  }
  async function postPatch(url, token, who, patch){
    const body = new URLSearchParams();
    body.set('token', token);
    body.set('who', who);
    body.set('patch', JSON.stringify(patch));
    const res = await fetch(url, {method:'POST', body});
    let data=null; try{ data = await res.json(); }catch{}
    if(!res.ok || !data || data.ok!==true){
      const msg = data && data.error ? data.error : ('Save failed (HTTP '+res.status+')');
      throw new Error(msg);
    }
  }

  function flash(text, kind){
    const box = document.getElementById('weeklyMsg');
    if(!box) return;
    box.textContent = text || '';
    box.className = 'banner' + (kind==='error' ? ' error' : kind==='success' ? ' success' : '');
    box.style.display = text ? 'block' : 'none';
    clearTimeout(flash._t); flash._t = setTimeout(()=>{ box.style.display='none'; }, 2500);
  }

  function renderWeeklyTable(state){
    const weeklyTable = document.getElementById('weeklyTable');
    const weeklyTbody = document.getElementById('weeklyTbody');
    const weekRangePDT = document.getElementById('weekRangePDT');
    if(!weeklyTbody) return;

    const tcol = todayColIndex();
    if(weeklyTable){
      const ths = weeklyTable.querySelectorAll('thead th');
      ths.forEach((th,i)=> th.classList.toggle('todaycol', (i-1)===tcol));
    }
    if(weekRangePDT) weekRangePDT.textContent = weekRangeLabelPDT();

    const weekKey = mondayOfWeekPDT();
    const cfg = state.weeklyTasksConfig || [];
    const done = (state.weeklyDone && state.weeklyDone[weekKey]) ? state.weeklyDone[weekKey] : {};
    weeklyTbody.innerHTML = "";

    cfg.forEach(task=>{
      const tr = document.createElement('tr');
      const tdName = document.createElement('td'); tdName.className = 'taskcol';
      tdName.innerHTML = `<div class="taskname">${task.label || '(unnamed task)'}</div>`;
      tr.appendChild(tdName);
      for(let i=0;i<5;i++){
        const td = document.createElement('td');
        const cb = document.createElement('input'); cb.type='checkbox'; cb.dataset.task = task.id; cb.dataset.col = String(i);
        const row = done[task.id] || [false,false,false,false,false];
        cb.checked = !!row[i];
        td.appendChild(cb); tr.appendChild(td);
      }
      weeklyTbody.appendChild(tr);
    });
  }

  function renderInlineEditor(state){
    const editor  = document.getElementById('weeklyEditor');
    const list    = document.getElementById('weeklyEditList');
    const btnToggle = document.getElementById('toggleWeeklyEditor');
    const btnAdd  = document.getElementById('addWeeklyTask');
    const btnSave = document.getElementById('saveWeeklyCfg');
    const role = getRole();

    // Show the ✏️ Edit button only for Keyholder
    if(btnToggle) btnToggle.style.display = (role==='keyholder') ? 'inline-flex' : 'none';
    // Always hide the editor for non-keyholders (even if they hack the DOM)
    if(editor){
      if(role!=='keyholder'){ editor.style.display = 'none'; }
    }

    if(!list) return;
    const cfg = state.weeklyTasksConfig || [];
    list.innerHTML = "";
    cfg.forEach((task, idx)=>{
      const wrap = document.createElement('div'); wrap.className = 'wk-row-edit';
      const input = document.createElement('input'); input.type='text'; input.value = task.label || ''; input.placeholder='Task name';
      input.className = 'wk-input';
      const del = document.createElement('button'); del.textContent = 'Delete'; del.className = 'wk-del';
      if(role!=='keyholder'){ input.disabled = true; del.disabled = true; }
      del.addEventListener('click', ()=>{
        if(role!=='keyholder') return;
        cfg.splice(idx,1);
        state.weeklyTasksConfig = cfg;
        renderInlineEditor(state); renderWeeklyTable(state);
      });
      input.addEventListener('input', ()=>{
        if(role!=='keyholder') return;
        task.label = input.value;
      });
      wrap.appendChild(input); wrap.appendChild(del);
      list.appendChild(wrap);
    });

    if(btnAdd)  btnAdd.disabled  = (role!=='keyholder');
    if(btnSave) btnSave.disabled = (role!=='keyholder');
  }

  async function init(){
    const root = document.getElementById('weeklyRoot');
    if(!root) return;
    const cfg = getCfg();
    let state = { weeklyTasksConfig: [], weeklyDone: {} };

    try{
      if(cfg.REMOTE_URL){
        state = await fetchShared(cfg.REMOTE_URL);
        state.weeklyTasksConfig = state.weeklyTasksConfig || [];
        state.weeklyDone = state.weeklyDone || {};
      }
    }catch(e){
      flash(String(e),'error');
    }

    renderWeeklyTable(state);
    renderInlineEditor(state);

    // Checkbox events
    const weeklyTbody = document.getElementById('weeklyTbody');
    if(weeklyTbody){
      weeklyTbody.addEventListener('change', async (e)=>{
        if(!e.target.matches('input[type="checkbox"]')) return;
        const role = getRole();
        if(!(role==='keyholder' || role==='sub')){ flash('Choose a role','error'); return; }
        const who = (role==='sub') ? 'sub' : 'keyholder';
        const token = who==='sub' ? cfg.TOKEN_SUB : cfg.TOKEN_KEY;
        const weekKey = mondayOfWeekPDT();
        const done = (state.weeklyDone && state.weeklyDone[weekKey]) ? JSON.parse(JSON.stringify(state.weeklyDone[weekKey])) : {};
        const taskId = e.target.dataset.task; const col = parseInt(e.target.dataset.col,10);
        const row = done[taskId] || [false,false,false,false,false]; row[col] = e.target.checked; done[taskId] = row;
        try{
          if(cfg.REMOTE_URL) await postPatch(cfg.REMOTE_URL, token, who, { weeklyDone: { [weekKey]: done } });
          state.weeklyDone[weekKey] = done;

          // If all tasks are checked for today, mark calendar as 'done'
          const idx = todayColIndex();
          if(idx>=0){
            const allToday = (state.weeklyTasksConfig||[]).length>0 &&
                             state.weeklyTasksConfig.every(t => (done[t.id]||[])[idx]===true);
            if(allToday && cfg.REMOTE_URL){
              const ymd = ymdInTZ(); const [yy,mm,dd] = ymd.split('-').map(Number);
              const ym = yy + '-' + String(mm).padStart(2,'0'); const day = dd;
              await postPatch(cfg.REMOTE_URL, token, who, { calendarSet: { ym, day, tags: ['done'] } });
            }
          }
          flash('Saved','success');
        }catch(err){ flash(String(err),'error'); }
      });
    }

    // Inline editor buttons
    const btnToggle = document.getElementById('toggleWeeklyEditor');
    const btnAdd = document.getElementById('addWeeklyTask');
    const btnSave = document.getElementById('saveWeeklyCfg');

    if(btnToggle){
      btnToggle.addEventListener('click', ()=>{
        const role = getRole(); if(role!=='keyholder') return;
        const editor = document.getElementById('weeklyEditor');
        if(editor) editor.style.display = (editor.style.display==='none'||!editor.style.display) ? 'block' : 'none';
      });
    }
    if(btnAdd){
      btnAdd.addEventListener('click', ()=>{
        const role = getRole(); if(role!=='keyholder') return flash('Keyholder mode required','error');
        const cfgList = state.weeklyTasksConfig || [];
        const id = 't' + Math.random().toString(36).slice(2,8);
        cfgList.push({id, label:'New Task'});
        state.weeklyTasksConfig = cfgList;
        renderInlineEditor(state); renderWeeklyTable(state);
      });
    }
    if(btnSave){
      btnSave.addEventListener('click', async ()=>{
        const role = getRole(); if(role!=='keyholder') return flash('Keyholder mode required','error');
        const clean = (state.weeklyTasksConfig||[]).map(t=>({id:t.id, label:(t.label||'').trim()})).filter(t=>t.label);
        try{
          if(cfg.REMOTE_URL) await postPatch(cfg.REMOTE_URL, cfg.TOKEN_KEY, 'keyholder', { weeklyTasksConfig: clean });
          state.weeklyTasksConfig = clean;
          renderWeeklyTable(state); renderInlineEditor(state);
          flash('Weekly tasks saved','success');
        }catch(err){ flash(String(err),'error'); }
      });
    }

    // PDT rollover watcher
    (function watchPdtRollover(){
      let last = ymdInTZ();
      setInterval(()=>{
        const cur = ymdInTZ();
        if(cur!==last){ last=cur; renderWeeklyTable(state); }
      }, 30000);
    })();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
