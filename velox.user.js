// ==UserScript==
// @name         Velox
// @namespace    https://velox.tools
// @version      2.2
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
    line.style.cssText = `padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:${colors[type]||'#6d28d9'};display:flex;gap:10px;align-items:flex-start;line-height:1.4`;
    line.innerHTML = `<span style="color:#94a3b8;font-size:11px;flex-shrink:0;font-family:monospace;padding-top:1px">${now()}</span><span>${msg}</span>`;
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
            tryClick(); setTimeout(tryClick, 600); stopBot();
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

  // ── UI ──────────────────────────────────────────────────────
  function buildPanel() {
    const TICKETS = [
      {v:'pink',c:'#ec4899'},{v:'red',c:'#ef4444'},{v:'blue',c:'#3b82f6'},
      {v:'green',c:'#22c55e'},{v:'yellow',c:'#eab308'},{v:'purple',c:'#a855f7'},
      {v:'orange',c:'#f97316'},{v:'white',c:'#cbd5e1',border:true},{v:'grey',c:'#94a3b8'}
    ];

    const style = document.createElement('style');
    style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

#vlx-wrap, #vlx-wrap * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }

#vlx-wrap {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 360px;
  z-index: 2147483647;
  filter: drop-shadow(0 16px 48px rgba(0,0,0,0.14)) drop-shadow(0 4px 12px rgba(0,0,0,0.08));
}

#vlx-panel {
  background: #ffffff;
  border-radius: 24px;
  border: 1.5px solid #e8edf3;
  overflow: hidden;
}
#vlx-panel.collapsed #vlx-body { display: none; }
#vlx-panel.collapsed #vlx-chev { transform: rotate(180deg); }

/* ── HEADER ── */
#vlx-hdr {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  background: linear-gradient(135deg, #7c3aed 0%, #9333ea 100%);
  cursor: pointer;
  user-select: none;
}
#vlx-hdr-ico { font-size: 22px; line-height: 1; flex-shrink: 0; }
#vlx-hdr-txt { flex: 1; min-width: 0; }
#vlx-title { font-size: 16px; font-weight: 800; color: #fff; letter-spacing: 0.5px; }
#vlx-status {
  font-size: 12px; color: rgba(255,255,255,0.65);
  margin-top: 3px; font-family: 'JetBrains Mono', monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#vlx-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: rgba(255,255,255,0.25); flex-shrink: 0;
  transition: background 0.3s;
}
#vlx-dot.on {
  background: #4ade80;
  box-shadow: 0 0 10px rgba(74,222,128,0.7);
  animation: vlxpulse 1.3s infinite;
}
@keyframes vlxpulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
#vlx-chev { color: rgba(255,255,255,0.5); font-size: 13px; transition: transform 0.28s; flex-shrink: 0; }

/* ── TABS ── */
.vlx-tabs {
  display: flex;
  background: #f9fafb;
  border-bottom: 1.5px solid #f1f5f9;
  padding: 0 8px;
  gap: 2px;
}
.vlx-tab {
  flex: 1; padding: 13px 4px; text-align: center;
  font-size: 12px; font-weight: 700; color: #9ca3af;
  cursor: pointer; border-bottom: 2.5px solid transparent;
  margin-bottom: -1.5px; transition: all 0.15s; letter-spacing: 0.2px;
}
.vlx-tab:hover { color: #6b7280; }
.vlx-tab.active { color: #7c3aed; border-bottom-color: #7c3aed; }

/* ── PANES ── */
.vlx-pane { display: none; }
.vlx-pane.active { display: block; }

.vlx-scroll {
  max-height: 370px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #e2e8f0 transparent;
}
.vlx-scroll::-webkit-scrollbar { width: 4px; }
.vlx-scroll::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }

/* ── SECTIONS ── */
.vlx-sec {
  padding: 22px 22px;
  border-bottom: 1.5px solid #f8fafc;
}
.vlx-sec:last-child { border-bottom: none; }

.vlx-sec-title {
  font-size: 10px; font-weight: 800;
  letter-spacing: 1.2px; text-transform: uppercase;
  color: #7c3aed; margin-bottom: 16px;
}

/* ── FIELDS ── */
.vlx-field { margin-bottom: 16px; }
.vlx-field:last-child { margin-bottom: 0; }
.vlx-field > label {
  display: block; font-size: 13px; font-weight: 600;
  color: #374151; margin-bottom: 7px;
}
.vlx-field input[type=text],
.vlx-field input[type=email],
.vlx-field input[type=tel],
.vlx-field input[type=number],
.vlx-field select {
  width: 100%;
  background: #f9fafb;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 15px;
  font-size: 14px;
  font-family: 'Outfit', sans-serif;
  color: #111827;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  -webkit-appearance: none; appearance: none;
}
.vlx-field input::placeholder { color: #9ca3af; }
.vlx-field input:focus,
.vlx-field select:focus {
  border-color: #7c3aed;
  box-shadow: 0 0 0 4px rgba(124,58,237,0.1);
  background: #fff;
}
.vlx-field select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='8' viewBox='0 0 14 8'%3E%3Cpath d='M1 1l6 5.5L13 1' stroke='%239ca3af' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 12px;
  padding-right: 38px;
  cursor: pointer;
}

/* ── CHIPS ── */
.vlx-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.vlx-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 99px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 13px; font-weight: 600; color: #9ca3af;
  cursor: pointer; transition: all 0.15s; line-height: 1;
}
.vlx-chip:hover { border-color: #c4b5fd; color: #7c3aed; background: #faf5ff; }
.vlx-chip.on { border-color: #7c3aed; background: #f5f3ff; color: #6d28d9; }
.vlx-cdot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }

/* ── RANGE ── */
.vlx-range-row { display: flex; align-items: center; gap: 14px; }
.vlx-range-row input[type=range] {
  flex: 1; -webkit-appearance: none; appearance: none;
  height: 5px; background: #e5e7eb; border-radius: 99px; outline: none; cursor: pointer;
}
.vlx-range-row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px; height: 20px; border-radius: 50%;
  background: #7c3aed; cursor: pointer;
  box-shadow: 0 2px 8px rgba(124,58,237,0.4);
}
.vlx-range-val {
  font-size: 13px; font-weight: 700; color: #7c3aed;
  min-width: 60px; text-align: right;
  font-family: 'JetBrains Mono', monospace;
}

/* ── TOGGLE ── */
.vlx-tog-row {
  display: flex; align-items: center;
  justify-content: space-between; padding: 12px 0;
}
.vlx-tog-row + .vlx-tog-row { border-top: 1px solid #f3f4f6; }
.vlx-tog-info { flex: 1; padding-right: 16px; }
.vlx-tog-label { font-size: 14px; font-weight: 600; color: #111827; }
.vlx-tog-desc { font-size: 12px; color: #9ca3af; margin-top: 3px; line-height: 1.4; }
.vlx-sw { position: relative; width: 44px; height: 26px; flex-shrink: 0; }
.vlx-sw input { opacity: 0; width: 0; height: 0; }
.vlx-sw-sl {
  position: absolute; inset: 0;
  background: #d1d5db; border-radius: 99px;
  cursor: pointer; transition: 0.22s;
}
.vlx-sw-sl::before {
  content: ''; position: absolute;
  left: 4px; top: 4px;
  width: 18px; height: 18px; border-radius: 50%;
  background: #fff; transition: 0.22s;
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
}
.vlx-sw input:checked + .vlx-sw-sl { background: #7c3aed; }
.vlx-sw input:checked + .vlx-sw-sl::before { transform: translateX(18px); }

/* ── LOG ── */
#vlx-log-body {
  height: 220px; overflow-y: auto; padding: 16px 20px;
  background: #fafafa;
  scrollbar-width: thin; scrollbar-color: #e2e8f0 transparent;
}
#vlx-log-body::-webkit-scrollbar { width: 4px; }
#vlx-log-body::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
.vlx-log-empty { text-align: center; color: #d1d5db; font-size: 13px; padding: 48px 0; }

.vlx-log-clear {
  display: block; width: calc(100% - 40px); margin: 12px 20px;
  padding: 10px; border-radius: 12px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
  color: #9ca3af; cursor: pointer; transition: all 0.15s;
}
.vlx-log-clear:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }

/* ── BUTTONS ── */
.vlx-btn-row {
  display: flex; gap: 12px; padding: 18px 22px;
  background: #f9fafb; border-top: 1.5px solid #f1f5f9;
}
.vlx-btn {
  flex: 1; padding: 14px 16px; border-radius: 14px; border: none;
  font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: all 0.18s; letter-spacing: 0.2px;
}
.vlx-save {
  background: #f3f4f6; color: #6b7280;
  border: 1.5px solid #e5e7eb; flex: 0 0 auto; padding: 14px 20px;
}
.vlx-save:hover { background: #e5e7eb; color: #374151; }
.vlx-run {
  background: linear-gradient(135deg, #7c3aed, #9333ea);
  color: #fff; box-shadow: 0 4px 16px rgba(124,58,237,0.38);
}
.vlx-run:hover { box-shadow: 0 8px 24px rgba(124,58,237,0.5); transform: translateY(-1px); }
.vlx-run:active { transform: none; }
.vlx-stop {
  background: #fff1f2; color: #e11d48;
  border: 1.5px solid #fecdd3;
}
.vlx-stop:hover { background: #ffe4e6; }

/* ── TOAST ── */
#vlx-toast {
  position: fixed; bottom: 28px; left: 50%;
  transform: translateX(-50%) translateY(80px);
  background: #111827; color: #fff;
  padding: 12px 24px; border-radius: 99px;
  font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
  transition: transform 0.32s cubic-bezier(0.34,1.56,0.64,1);
  z-index: 2147483648; pointer-events: none; white-space: nowrap;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
#vlx-toast.show { transform: translateX(-50%) translateY(0); }
    `;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.id = 'vlx-wrap';
    wrap.innerHTML = `
<div id="vlx-panel">
  <div id="vlx-hdr">
    <span id="vlx-hdr-ico">⚡</span>
    <div id="vlx-hdr-txt">
      <div id="vlx-title">VELOX</div>
      <div id="vlx-status">Siap dijalankan</div>
    </div>
    <span id="vlx-dot"></span>
    <span id="vlx-chev">▲</span>
  </div>

  <div id="vlx-body">
    <div class="vlx-tabs">
      <div class="vlx-tab active" data-pane="config">Config</div>
      <div class="vlx-tab" data-pane="tiket">Tiket</div>
      <div class="vlx-tab" data-pane="adv">Lanjutan</div>
      <div class="vlx-tab" data-pane="log">Log</div>
    </div>

    <!-- CONFIG -->
    <div class="vlx-pane active" id="vlx-pane-config">
      <div class="vlx-scroll">
        <div class="vlx-sec">
          <div class="vlx-sec-title">Data Diri</div>
          <div class="vlx-field"><label>Nama Lengkap</label><input type="text" id="vlx-name" placeholder="John Doe"/></div>
          <div class="vlx-field"><label>Email</label><input type="email" id="vlx-email" placeholder="email@gmail.com"/></div>
          <div class="vlx-field"><label>Nomor HP</label><input type="tel" id="vlx-phone" placeholder="085xxxxxxxx"/></div>
        </div>
        <div class="vlx-sec">
          <div class="vlx-sec-title">Target Kota</div>
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

    <!-- TIKET -->
    <div class="vlx-pane" id="vlx-pane-tiket">
      <div class="vlx-scroll">
        <div class="vlx-sec">
          <div class="vlx-sec-title">Hari</div>
          <div class="vlx-field">
            <select id="vlx-day">
              <option value="haritwo">Hari 2</option>
              <option value="harione">Hari 1</option>
              <option value="any">Semua Hari</option>
            </select>
          </div>
        </div>
        <div class="vlx-sec">
          <div class="vlx-sec-title">Tipe Tiket</div>
          <div class="vlx-chips" id="vlx-chips">
            ${TICKETS.map(t => `<div class="vlx-chip ${cfg.ticketTypes.includes(t.v)?'on':''}" data-type="${t.v}"><span class="vlx-cdot" style="background:${t.c}${t.border?';outline:1.5px solid #cbd5e1':''}"></span>${t.v.charAt(0).toUpperCase()+t.v.slice(1)}</div>`).join('')}
          </div>
        </div>
        <div class="vlx-sec">
          <div class="vlx-sec-title">Jumlah Tiket</div>
          <div class="vlx-range-row">
            <input type="range" id="vlx-count" min="1" max="8" value="${cfg.ticketCount}"/>
            <span class="vlx-range-val" id="vlx-count-v">${cfg.ticketCount} tiket</span>
          </div>
        </div>
        <div class="vlx-sec">
          <div class="vlx-sec-title">Strategi Pilih</div>
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

    <!-- ADVANCED -->
    <div class="vlx-pane" id="vlx-pane-adv">
      <div class="vlx-scroll">
        <div class="vlx-sec">
          <div class="vlx-sec-title">Timing</div>
          <div class="vlx-field">
            <label>Kecepatan cek form</label>
            <div class="vlx-range-row"><input type="range" id="vlx-interval" min="100" max="2000" step="100" value="${cfg.checkInterval}"/><span class="vlx-range-val" id="vlx-interval-v">${cfg.checkInterval}ms</span></div>
          </div>
          <div class="vlx-field">
            <label>Delay konfirmasi</label>
            <div class="vlx-range-row"><input type="range" id="vlx-cdelay" min="200" max="3000" step="100" value="${cfg.confirmDelay}"/><span class="vlx-range-val" id="vlx-cdelay-v">${cfg.confirmDelay}ms</span></div>
          </div>
          <div class="vlx-field">
            <label>Delay TnC</label>
            <div class="vlx-range-row"><input type="range" id="vlx-tdelay" min="100" max="1000" step="50" value="${cfg.tncDelay}"/><span class="vlx-range-val" id="vlx-tdelay-v">${cfg.tncDelay}ms</span></div>
          </div>
        </div>
        <div class="vlx-sec">
          <div class="vlx-sec-title">Auto Reload</div>
          <div class="vlx-tog-row">
            <div class="vlx-tog-info">
              <div class="vlx-tog-label">Auto reload</div>
              <div class="vlx-tog-desc">Reload otomatis jika tiket habis</div>
            </div>
            <label class="vlx-sw"><input type="checkbox" id="vlx-autoreload" ${cfg.autoReload?'checked':''}/><span class="vlx-sw-sl"></span></label>
          </div>
          <div class="vlx-field" style="margin-top:14px">
            <label>Delay reload</label>
            <div class="vlx-range-row"><input type="range" id="vlx-rdelay" min="500" max="10000" step="500" value="${cfg.reloadDelay}"/><span class="vlx-range-val" id="vlx-rdelay-v">${cfg.reloadDelay}ms</span></div>
          </div>
          <div class="vlx-field" style="margin-top:14px">
            <label>Max retry <span style="color:#9ca3af;font-weight:400">(0 = tak terbatas)</span></label>
            <input type="number" id="vlx-maxretry" value="${cfg.maxRetry}" min="0" max="100" style="width:90px"/>
          </div>
        </div>
        <div class="vlx-sec">
          <div class="vlx-sec-title">Lainnya</div>
          <div class="vlx-tog-row">
            <div class="vlx-tog-info">
              <div class="vlx-tog-label">Notifikasi suara</div>
              <div class="vlx-tog-desc">Beep saat tiket ditemukan</div>
            </div>
            <label class="vlx-sw"><input type="checkbox" id="vlx-sound" ${cfg.soundAlert?'checked':''}/><span class="vlx-sw-sl"></span></label>
          </div>
          <div class="vlx-tog-row">
            <div class="vlx-tog-info">
              <div class="vlx-tog-label">Auto confirm TnC</div>
              <div class="vlx-tog-desc">Centang syarat & privasi otomatis</div>
            </div>
            <label class="vlx-sw"><input type="checkbox" id="vlx-autoconfirm" ${cfg.autoConfirm?'checked':''}/><span class="vlx-sw-sl"></span></label>
          </div>
        </div>
      </div>
    </div>

    <!-- LOG -->
    <div class="vlx-pane" id="vlx-pane-log">
      <div id="vlx-log-body"><div class="vlx-log-empty">Log kosong — jalankan bot dulu</div></div>
      <button class="vlx-log-clear" id="vlx-clear">Hapus Log</button>
    </div>

    <div class="vlx-btn-row">
      <button class="vlx-btn vlx-save" id="vlx-save">💾 Simpan</button>
      <button class="vlx-btn vlx-run" id="vlx-start">▶ Jalankan</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(wrap);

    const toast = document.createElement('div');
    toast.id = 'vlx-toast';
    document.body.appendChild(toast);

    // Populate
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

    document.getElementById('vlx-hdr').addEventListener('click', () => {
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

    document.getElementById('vlx-start').addEventListener('click', () => {
      if (isRunning) { stopBot(); return; }
      document.getElementById('vlx-save').click();
      setTimeout(startBot, 100);
    });

    document.getElementById('vlx-clear').addEventListener('click', () => {
      document.getElementById('vlx-log-body').innerHTML = '<div class="vlx-log-empty">Log kosong — jalankan bot dulu</div>';
    });
  }

  function updateBtnState(running) {
    const btn = document.getElementById('vlx-start');
    const dot = document.getElementById('vlx-dot');
    if (!btn) return;
    if (running) {
      btn.textContent = '⏹ Stop'; btn.className = 'vlx-btn vlx-stop'; dot.classList.add('on');
    } else {
      btn.textContent = '▶ Jalankan'; btn.className = 'vlx-btn vlx-run'; dot.classList.remove('on');
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
