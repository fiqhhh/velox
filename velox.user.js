// ==UserScript==
// @name         Velox
// @namespace    https://velox.tools
// @version      2.1
// @description  Form auto-fill with full configuration panel
// @author       anon
// @match        https://ticket.allobankfest.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULTS = {
    name: '', email: '', phone: '',
    cityValue: 'bandung', ticketDay: 'haritwo',
    ticketTypes: ['pink','red','blue','green','yellow','purple','orange','white'],
    ticketCount: 1, pickStrategy: 'first-available',
    checkInterval: 500, confirmDelay: 1000, tncDelay: 300,
    autoReload: true, reloadDelay: 1000,
    soundAlert: true, autoConfirm: true, maxRetry: 0,
  };

  function loadCfg() {
    try { const s = GM_getValue('velox_config', null); return s ? Object.assign({}, DEFAULTS, JSON.parse(s)) : Object.assign({}, DEFAULTS); }
    catch(e) { return Object.assign({}, DEFAULTS); }
  }
  function saveCfg(c) { GM_setValue('velox_config', JSON.stringify(c)); }

  let cfg = loadCfg();
  let retryCount = GM_getValue('velox_retries', 0);
  let isRunning = false, checkIntervalId = null;

  function now() { return new Date().toLocaleTimeString('id-ID', { hour12: false }); }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  }

  function getTicketName(row) {
    const l = row.querySelector('.stage-tag');
    return l ? l.textContent.trim().toLowerCase() : '';
  }

  function sortTickets(rows, strategy) {
    const tier = ['vip','gold','platinum','silver','red','pink','blue','green','yellow','purple','orange','white','grey'];
    const arr = Array.from(rows);
    if (strategy === 'random') return arr.sort(() => Math.random() - 0.5);
    if (strategy === 'highest-tier') return arr.sort((a,b) => tier.indexOf(getTicketName(a)) - tier.indexOf(getTicketName(b)));
    if (strategy === 'lowest-tier') return arr.sort((a,b) => tier.indexOf(getTicketName(b)) - tier.indexOf(getTicketName(a)));
    return arr;
  }

  function logUI(msg, type = 'info') {
    console.log(`[Velox] ${msg}`);
    const box = document.getElementById('vlx-log-body');
    if (!box) return;
    const empty = box.querySelector('.vlx-log-empty');
    if (empty) empty.remove();
    const colors = { success:'#16a34a', error:'#dc2626', warn:'#d97706', info:'#6d28d9' };
    const line = document.createElement('div');
    line.style.cssText = `padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:${colors[type]||'#6d28d9'};display:flex;gap:8px;align-items:baseline`;
    line.innerHTML = `<span style="color:#94a3b8;font-size:11px;flex-shrink:0;font-family:monospace">${now()}</span><span>${msg}</span>`;
    box.appendChild(line);
    while (box.children.length > 60) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
    const st = document.getElementById('vlx-status');
    if (st) st.textContent = msg.replace(/[^\w\s\u00C0-\u024F]/gu, '').trim().slice(0, 36);
  }

  function startBot() {
    if (isRunning) { logUI('Bot sudah jalan!', 'warn'); return; }
    cfg = loadCfg();
    if (!cfg.name || !cfg.email || !cfg.phone) { logUI('Isi dulu data diri!', 'error'); return; }
    isRunning = true; updateBtnState(true);
    logUI('Velox dimulai!', 'success');
    if (checkIntervalId) clearInterval(checkIntervalId);
    checkIntervalId = setInterval(tryFillForm, cfg.checkInterval || 500);
  }

  function stopBot() {
    isRunning = false;
    if (checkIntervalId) { clearInterval(checkIntervalId); checkIntervalId = null; }
    updateBtnState(false); logUI('Bot dihentikan', 'warn');
  }

  function tryFillForm() {
    const inputs = document.querySelectorAll('.el-input__inner');
    const cityCheckbox = document.querySelector(`input[value="${cfg.cityValue}"]`);
    const daySelector = cfg.ticketDay === 'any' ? '.ticket-row' : `.${cfg.ticketDay} .ticket-row`;
    const ticketRows = document.querySelectorAll(daySelector);

    if (inputs.length >= 5 && cityCheckbox && ticketRows.length > 0) {
      clearInterval(checkIntervalId); checkIntervalId = null;
      logUI('Form ditemukan!', 'success');
      [cfg.name, cfg.email, cfg.email, cfg.phone, cfg.phone].forEach((v, i) => {
        if (inputs[i]) { inputs[i].value = v; inputs[i].dispatchEvent(new Event('input', { bubbles: true })); }
      });
      logUI('Data diri diisi', 'info');
      if (!cityCheckbox.checked) { cityCheckbox.click(); logUI('Kota dicentang', 'info'); }

      const sorted = sortTickets(ticketRows, cfg.pickStrategy);
      const target = sorted.find(row => {
        const name = getTicketName(row);
        const plusBtn = row.querySelectorAll('button.el-button--mini')[1];
        const soldOut = row.querySelector('.soldout');
        if (!plusBtn || soldOut || plusBtn.disabled) return false;
        return (cfg.ticketTypes || []).includes(name);
      });

      if (target) {
        const name = getTicketName(target).toUpperCase();
        const plusBtn = target.querySelectorAll('button.el-button--mini')[1];
        for (let i = 0; i < (cfg.ticketCount || 1); i++) setTimeout(() => plusBtn.click(), i * 120);
        if (cfg.soundAlert) playBeep();
        logUI(`Tiket dipilih: ${name} x${cfg.ticketCount}`, 'success');
        GM_setValue('velox_retries', 0);
        setTimeout(doFirstConfirm, cfg.confirmDelay || 1000);
      } else {
        logUI('Tidak ada tiket tersedia', 'error');
        handleNoTicket();
      }
    } else {
      logUI('Menunggu form...', 'info');
    }
  }

  function handleNoTicket() {
    if (!cfg.autoReload) { stopBot(); return; }
    const max = cfg.maxRetry || 0;
    if (max > 0 && retryCount >= max) { logUI('Max retry tercapai', 'error'); stopBot(); return; }
    retryCount++;
    GM_setValue('velox_retries', retryCount);
    GM_setValue('velox_autostart', true);
    logUI(`Reload ke-${retryCount}${max > 0 ? '/'+max : ''}...`, 'warn');
    isRunning = false;
    setTimeout(() => location.reload(), cfg.reloadDelay || 1000);
  }

  function doFirstConfirm() {
    const btn = document.querySelector('.captcha-validate .el-button:not(.is-disabled)');
    if (btn) {
      btn.click(); logUI('Konfirmasi diklik', 'info');
      if (cfg.autoConfirm) waitForTnC();
      else logUI('Selesaikan TnC manual', 'warn');
    } else { setTimeout(doFirstConfirm, 500); }
  }

  function waitForTnC() {
    let attempts = 0;
    const iv = setInterval(() => {
      if (++attempts > 40) { clearInterval(iv); logUI('Timeout TnC', 'warn'); return; }
      const cbS = document.querySelector('input[value="syarat"]');
      const cbP = document.querySelector('input[value="privacy"]');
      if (cbS && cbP) {
        clearInterval(iv);
        if (!cbS.checked) { cbS.click(); cbS.dispatchEvent(new Event('change',{bubbles:true})); logUI('Syarat dicentang','info'); }
        setTimeout(() => {
          if (!cbP.checked) { cbP.click(); cbP.dispatchEvent(new Event('change',{bubbles:true})); logUI('Privacy dicentang','info'); }
          setTimeout(() => {
            const tryClick = () => {
              const b = document.querySelector('.confirm-info-dialog button.el-button--default:not(.is-disabled)');
              if (b) { b.click(); logUI('Selesaikan CAPTCHA!', 'success'); }
            };
            tryClick();
            setTimeout(tryClick, 600);
            stopBot();
          }, cfg.tncDelay || 300);
        }, cfg.tncDelay || 300);
      }
    }, 500);
  }

  window.addEventListener('load', () => {
    if (GM_getValue('velox_autostart', false)) {
      GM_setValue('velox_autostart', false);
      setTimeout(() => { logUI('Lanjut setelah reload...', 'info'); startBot(); }, 1000);
    }
  });

  // ── BUILD UI ────────────────────────────────────────────────
  function buildPanel() {
    const TICKET_TYPES = [
      {v:'pink',c:'#ec4899'},{v:'red',c:'#ef4444'},{v:'blue',c:'#3b82f6'},
      {v:'green',c:'#22c55e'},{v:'yellow',c:'#eab308'},{v:'purple',c:'#a855f7'},
      {v:'orange',c:'#f97316'},{v:'white',c:'#e2e8f0',border:true},{v:'grey',c:'#94a3b8'}
    ];

    const style = document.createElement('style');
    style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
#vlx-wrap *{box-sizing:border-box;margin:0;padding:0}
#vlx-wrap{position:fixed;bottom:20px;right:20px;width:340px;font-family:'Outfit',sans-serif;font-size:14px;z-index:2147483647;filter:drop-shadow(0 8px 40px rgba(0,0,0,0.16))}
#vlx-panel{background:#fff;border-radius:20px;border:1.5px solid #e2e8f0;overflow:hidden;transition:all .28s cubic-bezier(.4,0,.2,1)}
#vlx-panel.collapsed #vlx-body{display:none}
#vlx-panel.collapsed #vlx-chevron{transform:rotate(180deg)}

#vlx-header{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#7c3aed;cursor:pointer;user-select:none}
#vlx-header-icon{font-size:20px;line-height:1}
#vlx-header-text{flex:1;min-width:0}
#vlx-title{font-weight:700;font-size:15px;color:#fff;letter-spacing:.3px}
#vlx-status{font-size:11px;color:rgba(255,255,255,.6);margin-top:2px;font-family:'JetBrains Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#vlx-indicator{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.25);flex-shrink:0;transition:background .3s}
#vlx-indicator.on{background:#4ade80;box-shadow:0 0 8px #4ade80;animation:vlxblink 1.2s infinite}
@keyframes vlxblink{0%,100%{opacity:1}50%{opacity:.3}}
#vlx-chevron{color:rgba(255,255,255,.55);font-size:12px;transition:transform .28s;flex-shrink:0}

.vlx-tabs{display:flex;background:#f8fafc;border-bottom:1.5px solid #e2e8f0;padding:0 6px}
.vlx-tab{flex:1;padding:11px 4px;text-align:center;font-size:12px;font-weight:600;color:#94a3b8;cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-1.5px;transition:all .15s}
.vlx-tab:hover{color:#475569}
.vlx-tab.active{color:#7c3aed;border-bottom-color:#7c3aed}

.vlx-pane{display:none}
.vlx-pane.active{display:block}
.vlx-scroll{max-height:340px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#e2e8f0 transparent}
.vlx-scroll::-webkit-scrollbar{width:4px}
.vlx-scroll::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:4px}

.vlx-section{padding:16px 18px;border-bottom:1.5px solid #f1f5f9}
.vlx-section:last-child{border-bottom:none}
.vlx-stitle{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7c3aed;margin-bottom:12px}

.vlx-field{margin-bottom:12px}
.vlx-field:last-child{margin-bottom:0}
.vlx-field>label{display:block;font-size:13px;font-weight:600;color:#475569;margin-bottom:5px}
.vlx-field input[type=text],.vlx-field input[type=email],.vlx-field input[type=tel],.vlx-field input[type=number],.vlx-field select{
  width:100%;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;
  padding:10px 13px;font-family:'Outfit',sans-serif;font-size:14px;color:#1e293b;
  outline:none;transition:border-color .15s,box-shadow .15s,background .15s;
  -webkit-appearance:none;appearance:none;
}
.vlx-field input:focus,.vlx-field select:focus{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.1);background:#fff}
.vlx-field select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' viewBox='0 0 12 7'%3E%3Cpath d='M1 1l5 4.5L11 1' stroke='%2394a3b8' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 13px center;padding-right:34px}

.vlx-chips{display:flex;flex-wrap:wrap;gap:7px}
.vlx-chip{display:flex;align-items:center;gap:5px;padding:7px 13px;border-radius:100px;border:1.5px solid #e2e8f0;background:#f8fafc;font-size:12px;font-weight:600;color:#94a3b8;cursor:pointer;transition:all .15s}
.vlx-chip:hover{border-color:#c4b5fd;color:#6d28d9;background:#faf5ff}
.vlx-chip.on{border-color:#7c3aed;background:#f5f3ff;color:#6d28d9}
.vlx-chip-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

.vlx-range-wrap{display:flex;align-items:center;gap:12px}
.vlx-range-wrap input[type=range]{flex:1;-webkit-appearance:none;height:4px;background:#e2e8f0;border-radius:4px;outline:none}
.vlx-range-wrap input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#7c3aed;cursor:pointer;box-shadow:0 2px 6px rgba(124,58,237,.35)}
.vlx-range-val{font-size:13px;font-weight:600;color:#7c3aed;min-width:58px;text-align:right;font-family:'JetBrains Mono',monospace}

.vlx-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0}
.vlx-toggle-row+.vlx-toggle-row{border-top:1px solid #f8fafc}
.vlx-toggle-info{flex:1}
.vlx-toggle-label{font-size:14px;font-weight:500;color:#1e293b}
.vlx-toggle-desc{font-size:12px;color:#94a3b8;margin-top:2px}
.vlx-sw{position:relative;width:42px;height:24px;flex-shrink:0;margin-left:12px}
.vlx-sw input{opacity:0;width:0;height:0}
.vlx-sw-sl{position:absolute;inset:0;background:#e2e8f0;border-radius:24px;cursor:pointer;transition:.2s}
.vlx-sw-sl::before{content:'';position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 4px rgba(0,0,0,.15)}
.vlx-sw input:checked+.vlx-sw-sl{background:#7c3aed}
.vlx-sw input:checked+.vlx-sw-sl::before{transform:translateX(18px)}

#vlx-log-body{height:210px;overflow-y:auto;padding:12px 16px;background:#fafafa;scrollbar-width:thin;scrollbar-color:#e2e8f0 transparent}
#vlx-log-body::-webkit-scrollbar{width:4px}
#vlx-log-body::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:4px}
.vlx-log-empty{text-align:center;color:#cbd5e1;font-size:13px;padding:40px 0}

.vlx-btn-row{display:flex;gap:10px;padding:14px 18px;background:#f8fafc;border-top:1.5px solid #e2e8f0}
.vlx-btn{flex:1;padding:12px 16px;border-radius:12px;border:none;font-family:'Outfit',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:all .18s}
.vlx-btn-save{background:#f1f5f9;color:#475569;border:1.5px solid #e2e8f0}
.vlx-btn-save:hover{background:#e2e8f0}
.vlx-btn-run{background:#7c3aed;color:#fff;box-shadow:0 4px 14px rgba(124,58,237,.35)}
.vlx-btn-run:hover{background:#6d28d9;transform:translateY(-1px);box-shadow:0 6px 20px rgba(124,58,237,.45)}
.vlx-btn-run:active{transform:none}
.vlx-btn-stop{background:#fef2f2;color:#dc2626;border:1.5px solid #fecaca}
.vlx-btn-stop:hover{background:#fee2e2}

.vlx-btn-clear{display:block;width:calc(100% - 32px);margin:10px 16px;padding:9px;border-radius:10px;border:1.5px solid #e2e8f0;background:#f8fafc;font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;color:#94a3b8;cursor:pointer;transition:all .15s}
.vlx-btn-clear:hover{background:#fee2e2;color:#dc2626;border-color:#fecaca}

#vlx-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(70px);background:#1e293b;color:#fff;padding:10px 22px;border-radius:100px;font-family:'Outfit',sans-serif;font-size:14px;font-weight:600;transition:transform .32s cubic-bezier(.34,1.56,.64,1);z-index:2147483648;pointer-events:none;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.2)}
#vlx-toast.show{transform:translateX(-50%) translateY(0)}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.id = 'vlx-wrap';
    wrap.innerHTML = `
<div id="vlx-panel">
  <div id="vlx-header">
    <span id="vlx-header-icon">⚡</span>
    <div id="vlx-header-text">
      <div id="vlx-title">VELOX</div>
      <div id="vlx-status">Siap dijalankan</div>
    </div>
    <span id="vlx-indicator"></span>
    <span id="vlx-chevron">▲</span>
  </div>
  <div id="vlx-body">
    <div class="vlx-tabs">
      <div class="vlx-tab active" data-pane="config">Config</div>
      <div class="vlx-tab" data-pane="tiket">Tiket</div>
      <div class="vlx-tab" data-pane="adv">Lanjutan</div>
      <div class="vlx-tab" data-pane="log">Log</div>
    </div>

    <div class="vlx-pane active" id="vlx-pane-config">
      <div class="vlx-scroll">
        <div class="vlx-section">
          <div class="vlx-stitle">Data Diri</div>
          <div class="vlx-field"><label>Nama Lengkap</label><input type="text" id="vlx-name" placeholder="John Doe"/></div>
          <div class="vlx-field"><label>Email</label><input type="email" id="vlx-email" placeholder="email@gmail.com"/></div>
          <div class="vlx-field"><label>Nomor HP</label><input type="tel" id="vlx-phone" placeholder="085xxxxxxxx"/></div>
        </div>
        <div class="vlx-section">
          <div class="vlx-stitle">Target Kota</div>
          <div class="vlx-field">
            <select id="vlx-city">
              <option value="bandung">Bandung</option>
              <option value="jakarta">Jakarta</option>
              <option value="surabaya">Surabaya</option>
              <option value="medan">Medan</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="vlx-pane" id="vlx-pane-tiket">
      <div class="vlx-scroll">
        <div class="vlx-section">
          <div class="vlx-stitle">Hari</div>
          <div class="vlx-field">
            <select id="vlx-day">
              <option value="haritwo">Hari 2</option>
              <option value="harione">Hari 1</option>
              <option value="any">Semua Hari</option>
            </select>
          </div>
        </div>
        <div class="vlx-section">
          <div class="vlx-stitle">Tipe Tiket</div>
          <div class="vlx-chips" id="vlx-chips">
            ${TICKET_TYPES.map(t => `<div class="vlx-chip ${cfg.ticketTypes.includes(t.v)?'on':''}" data-type="${t.v}"><span class="vlx-chip-dot" style="background:${t.c}${t.border?';border:1.5px solid #cbd5e1':''}"></span>${t.v.charAt(0).toUpperCase()+t.v.slice(1)}</div>`).join('')}
          </div>
        </div>
        <div class="vlx-section">
          <div class="vlx-stitle">Jumlah Tiket</div>
          <div class="vlx-range-wrap">
            <input type="range" id="vlx-count" min="1" max="8" value="${cfg.ticketCount}"/>
            <span class="vlx-range-val" id="vlx-count-v">${cfg.ticketCount} tiket</span>
          </div>
        </div>
        <div class="vlx-section">
          <div class="vlx-stitle">Strategi Pilih</div>
          <div class="vlx-field">
            <select id="vlx-strategy">
              <option value="first-available">Pertama tersedia</option>
              <option value="highest-tier">Tier tertinggi</option>
              <option value="lowest-tier">Tier terendah</option>
              <option value="random">Acak</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="vlx-pane" id="vlx-pane-adv">
      <div class="vlx-scroll">
        <div class="vlx-section">
          <div class="vlx-stitle">Timing</div>
          <div class="vlx-field"><label>Kecepatan cek form</label>
            <div class="vlx-range-wrap"><input type="range" id="vlx-interval" min="100" max="2000" step="100" value="${cfg.checkInterval}"/><span class="vlx-range-val" id="vlx-interval-v">${cfg.checkInterval}ms</span></div>
          </div>
          <div class="vlx-field"><label>Delay konfirmasi</label>
            <div class="vlx-range-wrap"><input type="range" id="vlx-cdelay" min="200" max="3000" step="100" value="${cfg.confirmDelay}"/><span class="vlx-range-val" id="vlx-cdelay-v">${cfg.confirmDelay}ms</span></div>
          </div>
          <div class="vlx-field"><label>Delay TnC</label>
            <div class="vlx-range-wrap"><input type="range" id="vlx-tdelay" min="100" max="1000" step="50" value="${cfg.tncDelay}"/><span class="vlx-range-val" id="vlx-tdelay-v">${cfg.tncDelay}ms</span></div>
          </div>
        </div>
        <div class="vlx-section">
          <div class="vlx-stitle">Auto Reload</div>
          <div class="vlx-toggle-row">
            <div class="vlx-toggle-info"><div class="vlx-toggle-label">Auto reload</div><div class="vlx-toggle-desc">Reload jika tiket habis</div></div>
            <label class="vlx-sw"><input type="checkbox" id="vlx-autoreload" ${cfg.autoReload?'checked':''}/><span class="vlx-sw-sl"></span></label>
          </div>
          <div class="vlx-field" style="margin-top:10px"><label>Delay reload</label>
            <div class="vlx-range-wrap"><input type="range" id="vlx-rdelay" min="500" max="10000" step="500" value="${cfg.reloadDelay}"/><span class="vlx-range-val" id="vlx-rdelay-v">${cfg.reloadDelay}ms</span></div>
          </div>
          <div class="vlx-field" style="margin-top:10px">
            <label>Max retry <span style="color:#94a3b8;font-weight:400">(0 = tak terbatas)</span></label>
            <input type="number" id="vlx-maxretry" value="${cfg.maxRetry}" min="0" max="100" style="width:80px"/>
          </div>
        </div>
        <div class="vlx-section">
          <div class="vlx-stitle">Lainnya</div>
          <div class="vlx-toggle-row">
            <div class="vlx-toggle-info"><div class="vlx-toggle-label">Notifikasi suara</div><div class="vlx-toggle-desc">Beep saat tiket ditemukan</div></div>
            <label class="vlx-sw"><input type="checkbox" id="vlx-sound" ${cfg.soundAlert?'checked':''}/><span class="vlx-sw-sl"></span></label>
          </div>
          <div class="vlx-toggle-row">
            <div class="vlx-toggle-info"><div class="vlx-toggle-label">Auto confirm TnC</div><div class="vlx-toggle-desc">Centang syarat otomatis</div></div>
            <label class="vlx-sw"><input type="checkbox" id="vlx-autoconfirm" ${cfg.autoConfirm?'checked':''}/><span class="vlx-sw-sl"></span></label>
          </div>
        </div>
      </div>
    </div>

    <div class="vlx-pane" id="vlx-pane-log">
      <div id="vlx-log-body"><div class="vlx-log-empty">Log kosong — jalankan bot dulu</div></div>
      <button class="vlx-btn-clear" id="vlx-clear-log">Hapus Log</button>
    </div>

    <div class="vlx-btn-row">
      <button class="vlx-btn vlx-btn-save" id="vlx-save">💾 Simpan</button>
      <button class="vlx-btn vlx-btn-run" id="vlx-start">▶ Jalankan</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(wrap);

    const toast = document.createElement('div');
    toast.id = 'vlx-toast';
    document.body.appendChild(toast);

    // Populate fields
    document.getElementById('vlx-name').value = cfg.name;
    document.getElementById('vlx-email').value = cfg.email;
    document.getElementById('vlx-phone').value = cfg.phone;
    document.getElementById('vlx-city').value = cfg.cityValue;
    document.getElementById('vlx-day').value = cfg.ticketDay;
    document.getElementById('vlx-strategy').value = cfg.pickStrategy;

    // Tabs
    wrap.querySelectorAll('.vlx-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        wrap.querySelectorAll('.vlx-tab').forEach(t => t.classList.remove('active'));
        wrap.querySelectorAll('.vlx-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('vlx-pane-' + tab.dataset.pane).classList.add('active');
      });
    });

    // Collapse
    document.getElementById('vlx-header').addEventListener('click', () => {
      document.getElementById('vlx-panel').classList.toggle('collapsed');
    });

    // Ranges
    [
      ['vlx-count','vlx-count-v', v => v+' tiket'],
      ['vlx-interval','vlx-interval-v', v => v+'ms'],
      ['vlx-cdelay','vlx-cdelay-v', v => v+'ms'],
      ['vlx-tdelay','vlx-tdelay-v', v => v+'ms'],
      ['vlx-rdelay','vlx-rdelay-v', v => v+'ms'],
    ].forEach(([id,vid,fmt]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => document.getElementById(vid).textContent = fmt(el.value));
    });

    // Chips
    wrap.querySelectorAll('.vlx-chip').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('on'));
    });

    // Save
    document.getElementById('vlx-save').addEventListener('click', () => {
      const nc = {
        name: document.getElementById('vlx-name').value.trim(),
        email: document.getElementById('vlx-email').value.trim(),
        phone: document.getElementById('vlx-phone').value.trim(),
        cityValue: document.getElementById('vlx-city').value,
        ticketDay: document.getElementById('vlx-day').value,
        ticketTypes: Array.from(wrap.querySelectorAll('.vlx-chip.on')).map(c => c.dataset.type),
        ticketCount: parseInt(document.getElementById('vlx-count').value),
        pickStrategy: document.getElementById('vlx-strategy').value,
        checkInterval: parseInt(document.getElementById('vlx-interval').value),
        confirmDelay: parseInt(document.getElementById('vlx-cdelay').value),
        tncDelay: parseInt(document.getElementById('vlx-tdelay').value),
        autoReload: document.getElementById('vlx-autoreload').checked,
        reloadDelay: parseInt(document.getElementById('vlx-rdelay').value),
        soundAlert: document.getElementById('vlx-sound').checked,
        autoConfirm: document.getElementById('vlx-autoconfirm').checked,
        maxRetry: parseInt(document.getElementById('vlx-maxretry').value) || 0,
      };
      saveCfg(nc); cfg = nc;
      showToast('✅ Config tersimpan!');
    });

    // Start / Stop
    document.getElementById('vlx-start').addEventListener('click', () => {
      if (isRunning) { stopBot(); return; }
      document.getElementById('vlx-save').click();
      setTimeout(startBot, 100);
    });

    // Clear log
    document.getElementById('vlx-clear-log').addEventListener('click', () => {
      document.getElementById('vlx-log-body').innerHTML = '<div class="vlx-log-empty">Log kosong — jalankan bot dulu</div>';
    });
  }

  function updateBtnState(running) {
    const btn = document.getElementById('vlx-start');
    const dot = document.getElementById('vlx-indicator');
    if (!btn) return;
    if (running) {
      btn.textContent = '⏹ Stop'; btn.className = 'vlx-btn vlx-btn-stop'; dot.classList.add('on');
    } else {
      btn.textContent = '▶ Jalankan'; btn.className = 'vlx-btn vlx-btn-run'; dot.classList.remove('on');
    }
  }

  function showToast(msg) {
    const t = document.getElementById('vlx-toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  if (document.body) buildPanel();
  else window.addEventListener('DOMContentLoaded', buildPanel);

})();
