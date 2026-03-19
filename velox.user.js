// ==UserScript==
// @name         Velox
// @namespace    https://velox.tools
// @version      2.0
// @description  Form auto-fill with full configuration panel
// @author       anon
// @match        https://ticket.allobankfest.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── DEFAULT CONFIG ──────────────────────────────────────────
  const DEFAULTS = {
    name: '',
    email: '',
    phone: '',
    cityValue: 'bandung',
    ticketDay: 'haritwo',
    ticketTypes: ['pink','red','blue','green','yellow','purple','orange','white'],
    ticketCount: 1,
    pickStrategy: 'first-available',
    checkInterval: 500,
    confirmDelay: 1000,
    tncDelay: 300,
    autoReload: true,
    reloadDelay: 1000,
    soundAlert: true,
    autoConfirm: true,
    maxRetry: 0,
  };

  function loadCfg() {
    try {
      const saved = GM_getValue('velox_config', null);
      return saved ? Object.assign({}, DEFAULTS, JSON.parse(saved)) : Object.assign({}, DEFAULTS);
    } catch(e) { return Object.assign({}, DEFAULTS); }
  }
  function saveCfg(cfg) {
    GM_setValue('velox_config', JSON.stringify(cfg));
  }

  let cfg = loadCfg();
  let retryCount = GM_getValue('velox_retries', 0);
  let isRunning = false;
  let checkIntervalId = null;

  // ─── UTILS ───────────────────────────────────────────────────
  function now() {
    return new Date().toLocaleTimeString('id-ID', { hour12: false });
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  }

  function getTicketName(row) {
    const label = row.querySelector('.stage-tag');
    return label ? label.textContent.trim().toLowerCase() : '';
  }

  function sortTickets(rows, strategy) {
    const tier = ['vip','gold','platinum','silver','red','pink','blue','green','yellow','purple','orange','white','grey'];
    const arr = Array.from(rows);
    if (strategy === 'random') return arr.sort(() => Math.random() - 0.5);
    if (strategy === 'highest-tier') return arr.sort((a,b) => tier.indexOf(getTicketName(a)) - tier.indexOf(getTicketName(b)));
    if (strategy === 'lowest-tier') return arr.sort((a,b) => tier.indexOf(getTicketName(b)) - tier.indexOf(getTicketName(a)));
    return arr;
  }

  // ─── LOG UI ───────────────────────────────────────────────────
  function logUI(msg, type = 'info') {
    console.log(`[Velox] ${msg}`);
    const box = document.getElementById('vlx-log-body');
    if (!box) return;
    const colors = { success:'#22d65f', error:'#ff4444', warn:'#f5c518', info:'#a855f7' };
    const line = document.createElement('div');
    line.style.cssText = `padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:11px;color:${colors[type]||'#a855f7'}`;
    line.innerHTML = `<span style="color:#444;margin-right:5px">${now()}</span>${msg}`;
    box.appendChild(line);
    while (box.children.length > 60) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;

    // Update status text
    const st = document.getElementById('vlx-status');
    if (st) st.textContent = msg.replace(/[^\w\sÀ-ÿ✅❌🎫🔄⏳👉☑️🚀📝]/gu, '').trim().slice(0, 40);
  }

  // ─── BOT LOGIC ───────────────────────────────────────────────
  function startBot() {
    if (isRunning) { logUI('⚠️ Bot sudah jalan!', 'warn'); return; }
    cfg = loadCfg();
    if (!cfg.name || !cfg.email || !cfg.phone) {
      logUI('❌ Isi dulu data diri di panel Settings!', 'error'); return;
    }
    isRunning = true;
    updateBtnState(true);
    logUI('🚀 Velox dimulai!', 'success');

    if (checkIntervalId) clearInterval(checkIntervalId);
    checkIntervalId = setInterval(tryFillForm, cfg.checkInterval || 500);
  }

  function stopBot() {
    isRunning = false;
    if (checkIntervalId) { clearInterval(checkIntervalId); checkIntervalId = null; }
    updateBtnState(false);
    logUI('⏹ Bot dihentikan', 'warn');
  }

  function tryFillForm() {
    const inputs = document.querySelectorAll('.el-input__inner');
    const cityCheckbox = document.querySelector(`input[value="${cfg.cityValue}"]`);
    const daySelector = cfg.ticketDay === 'any' ? '.ticket-row' : `.${cfg.ticketDay} .ticket-row`;
    const ticketRows = document.querySelectorAll(daySelector);

    if (inputs.length >= 5 && cityCheckbox && ticketRows.length > 0) {
      clearInterval(checkIntervalId); checkIntervalId = null;
      logUI('✅ Form ditemukan, mengisi data...', 'success');

      // Fill form
      [cfg.name, cfg.email, cfg.email, cfg.phone, cfg.phone].forEach((v, i) => {
        if (inputs[i]) {
          inputs[i].value = v;
          inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      logUI('📝 Data diri diisi', 'info');

      if (!cityCheckbox.checked) { cityCheckbox.click(); logUI(`☑️ Kota dicentang`, 'info'); }

      // Pick ticket
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
        for (let i = 0; i < (cfg.ticketCount || 1); i++) {
          setTimeout(() => plusBtn.click(), i * 120);
        }
        if (cfg.soundAlert) playBeep();
        logUI(`🎫 Tiket dipilih: ${name} × ${cfg.ticketCount}`, 'success');
        GM_setValue('velox_retries', 0);

        setTimeout(doFirstConfirm, cfg.confirmDelay || 1000);
      } else {
        logUI('❌ Tidak ada tiket tersedia', 'error');
        handleNoTicket();
      }
    } else {
      logUI('🔍 Menunggu form...', 'info');
    }
  }

  function handleNoTicket() {
    if (!cfg.autoReload) { stopBot(); return; }
    const max = cfg.maxRetry || 0;
    if (max > 0 && retryCount >= max) {
      logUI(`🛑 Max retry (${max}) tercapai`, 'error');
      stopBot(); return;
    }
    retryCount++;
    GM_setValue('velox_retries', retryCount);
    GM_setValue('velox_autostart', true);
    logUI(`🔄 Reload ke-${retryCount}${max > 0 ? '/'+max : ''}...`, 'warn');
    isRunning = false;
    setTimeout(() => location.reload(), cfg.reloadDelay || 1000);
  }

  function doFirstConfirm() {
    const btn = document.querySelector('.captcha-validate .el-button:not(.is-disabled)');
    if (btn) {
      btn.click();
      logUI('👉 Konfirmasi pertama diklik', 'info');
      if (cfg.autoConfirm) waitForTnC();
      else logUI('⏸ Selesaikan TnC & CAPTCHA manual', 'warn');
    } else {
      setTimeout(doFirstConfirm, 500);
    }
  }

  function waitForTnC() {
    let attempts = 0;
    const iv = setInterval(() => {
      if (++attempts > 40) { clearInterval(iv); logUI('⚠️ Timeout TnC', 'warn'); return; }
      const cbS = document.querySelector('input[value="syarat"]');
      const cbP = document.querySelector('input[value="privacy"]');
      if (cbS && cbP) {
        clearInterval(iv);
        if (!cbS.checked) { cbS.click(); cbS.dispatchEvent(new Event('change',{bubbles:true})); logUI('☑️ Syarat dicentang','info'); }
        setTimeout(() => {
          if (!cbP.checked) { cbP.click(); cbP.dispatchEvent(new Event('change',{bubbles:true})); logUI('☑️ Privacy dicentang','info'); }
          setTimeout(() => {
            const finalBtn = document.querySelector('.confirm-info-dialog button.el-button--default:not(.is-disabled)');
            if (finalBtn) { finalBtn.click(); logUI('🚀 Selesaikan CAPTCHA manual!', 'success'); }
            else {
              setTimeout(() => {
                const rb = document.querySelector('.confirm-info-dialog button.el-button--default:not(.is-disabled)');
                if (rb) { rb.click(); logUI('🚀 Selesaikan CAPTCHA manual!', 'success'); }
              }, 600);
            }
            stopBot();
          }, cfg.tncDelay || 300);
        }, cfg.tncDelay || 300);
      }
    }, 500);
  }

  // ─── AUTO-START AFTER RELOAD ─────────────────────────────────
  window.addEventListener('load', () => {
    if (GM_getValue('velox_autostart', false)) {
      GM_setValue('velox_autostart', false);
      setTimeout(() => { logUI('♻️ Lanjut setelah reload...', 'info'); startBot(); }, 1000);
    }
  });

  // ─── PANEL UI ─────────────────────────────────────────────────
  function buildPanel() {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');
      #vlx-panel *{box-sizing:border-box;margin:0;padding:0}
      #vlx-panel{
        position:fixed;bottom:16px;right:16px;
        width:300px;
        background:#0d0d18;
        border:1px solid #252540;
        border-radius:16px;
        font-family:'Plus Jakarta Sans',sans-serif;
        font-size:13px;color:#e0deff;
        z-index:2147483647;
        box-shadow:0 20px 60px rgba(0,0,0,0.7);
        overflow:hidden;
        transition:height .25s ease;
      }
      #vlx-panel.collapsed{height:48px}
      #vlx-header{
        display:flex;align-items:center;justify-content:space-between;
        padding:0 14px;height:48px;
        background:linear-gradient(90deg,rgba(124,58,237,.2),rgba(124,58,237,.05));
        border-bottom:1px solid #252540;
        cursor:pointer;user-select:none;flex-shrink:0;
      }
      #vlx-title{font-weight:700;font-size:13px;letter-spacing:.5px;display:flex;align-items:center;gap:7px}
      #vlx-dot{width:7px;height:7px;border-radius:50%;background:#444;transition:background .3s}
      #vlx-dot.on{background:#22d65f;box-shadow:0 0 6px #22d65f;animation:vlxpulse 1s infinite}
      @keyframes vlxpulse{0%,100%{opacity:1}50%{opacity:.3}}
      #vlx-status{font-size:10px;color:#555;font-family:'JetBrains Mono',monospace;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #vlx-toggle-icon{font-size:16px;color:#555;transition:transform .25s}
      #vlx-panel.collapsed #vlx-toggle-icon{transform:rotate(180deg)}

      #vlx-body{overflow:hidden}
      .vlx-tabs{display:flex;border-bottom:1px solid #1a1a2e}
      .vlx-tab{
        flex:1;padding:8px 4px;text-align:center;
        font-size:10px;font-weight:700;letter-spacing:.5px;
        color:#555;cursor:pointer;text-transform:uppercase;
        border-bottom:2px solid transparent;transition:all .15s;
      }
      .vlx-tab:hover{color:#ccc}
      .vlx-tab.active{color:#a855f7;border-bottom-color:#a855f7;background:rgba(168,85,247,.05)}

      .vlx-pane{display:none;max-height:320px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#252540 transparent}
      .vlx-pane::-webkit-scrollbar{width:3px}
      .vlx-pane::-webkit-scrollbar-thumb{background:#252540}
      .vlx-pane.active{display:block}

      .vlx-section{padding:12px 14px;border-bottom:1px solid #1a1a2e}
      .vlx-section:last-child{border-bottom:none}
      .vlx-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a855f7;margin-bottom:8px}
      .vlx-field{margin-bottom:8px}
      .vlx-field:last-child{margin-bottom:0}
      .vlx-field label{display:block;font-size:10px;color:#666;margin-bottom:3px;font-weight:600}
      .vlx-field input[type=text],.vlx-field input[type=email],.vlx-field input[type=tel],.vlx-field input[type=number],.vlx-field select{
        width:100%;background:#131320;border:1px solid #252540;border-radius:6px;
        padding:6px 9px;color:#e0deff;font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;
        transition:border-color .15s;
      }
      .vlx-field input:focus,.vlx-field select:focus{border-color:#7c3aed}
      .vlx-field select option{background:#131320}

      .vlx-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
      .vlx-chip{
        display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:100px;
        border:1px solid #252540;background:#131320;font-size:10px;
        font-family:'JetBrains Mono',monospace;cursor:pointer;transition:all .15s;color:#666;
      }
      .vlx-chip.on{border-color:#7c3aed;background:rgba(124,58,237,.15);color:#c084fc}
      .vlx-chip-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}

      .vlx-range-row{display:flex;align-items:center;gap:8px}
      .vlx-range-row input[type=range]{
        flex:1;-webkit-appearance:none;height:3px;background:#252540;border-radius:2px;outline:none;
      }
      .vlx-range-row input[type=range]::-webkit-slider-thumb{
        -webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#a855f7;cursor:pointer;
      }
      .vlx-range-val{font-family:'JetBrains Mono',monospace;font-size:11px;color:#a855f7;min-width:46px;text-align:right}

      .vlx-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:5px 0}
      .vlx-toggle-label{font-size:12px;color:#ccc}
      .vlx-sw{position:relative;width:32px;height:18px;flex-shrink:0}
      .vlx-sw input{opacity:0;width:0;height:0}
      .vlx-sw-slider{position:absolute;inset:0;background:#252540;border-radius:18px;cursor:pointer;transition:.2s}
      .vlx-sw-slider::before{content:'';position:absolute;left:3px;top:3px;width:12px;height:12px;border-radius:50%;background:#555;transition:.2s}
      .vlx-sw input:checked+.vlx-sw-slider{background:rgba(124,58,237,.4)}
      .vlx-sw input:checked+.vlx-sw-slider::before{background:#a855f7;transform:translateX(14px);box-shadow:0 0 5px rgba(168,85,247,.6)}

      #vlx-log-body{
        height:160px;overflow-y:auto;
        background:#080810;padding:8px 10px;
        font-family:'JetBrains Mono',monospace;
        scrollbar-width:thin;scrollbar-color:#252540 transparent;
      }
      #vlx-log-body::-webkit-scrollbar{width:3px}
      #vlx-log-body::-webkit-scrollbar-thumb{background:#252540}

      .vlx-btn-row{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #1a1a2e}
      .vlx-btn{
        flex:1;padding:9px;border-radius:8px;border:none;
        font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;
        cursor:pointer;transition:all .2s;letter-spacing:.3px;
      }
      .vlx-btn-start{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;box-shadow:0 4px 14px rgba(124,58,237,.4)}
      .vlx-btn-start:hover{box-shadow:0 6px 20px rgba(124,58,237,.6);transform:translateY(-1px)}
      .vlx-btn-save{background:#131320;color:#a855f7;border:1px solid #252540}
      .vlx-btn-save:hover{border-color:#7c3aed}
      .vlx-btn-stop{background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.3)}

      .vlx-toast{
        position:fixed;bottom:16px;left:50%;transform:translateX(-50%) translateY(60px);
        background:#22d65f;color:#000;padding:7px 18px;border-radius:100px;
        font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;
        transition:transform .3s cubic-bezier(.34,1.56,.64,1);z-index:2147483648;pointer-events:none;
      }
      .vlx-toast.show{transform:translateX(-50%) translateY(0)}
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'vlx-panel';
    panel.innerHTML = `
      <div id="vlx-header">
        <div id="vlx-title"><span id="vlx-dot"></span>VELOX</div>
        <div id="vlx-status">Siap</div>
        <span id="vlx-toggle-icon">▲</span>
      </div>
      <div id="vlx-body">
        <div class="vlx-tabs">
          <div class="vlx-tab active" data-pane="config">Config</div>
          <div class="vlx-tab" data-pane="tiket">Tiket</div>
          <div class="vlx-tab" data-pane="adv">Adv</div>
          <div class="vlx-tab" data-pane="log">Log</div>
        </div>

        <!-- CONFIG -->
        <div class="vlx-pane active" id="vlx-pane-config">
          <div class="vlx-section">
            <div class="vlx-label">Data Diri</div>
            <div class="vlx-field"><label>Nama</label><input type="text" id="vlx-name" placeholder="Nama Lengkap"/></div>
            <div class="vlx-field"><label>Email</label><input type="email" id="vlx-email" placeholder="email@gmail.com"/></div>
            <div class="vlx-field"><label>No. HP</label><input type="tel" id="vlx-phone" placeholder="085xxxxxxxx"/></div>
          </div>
          <div class="vlx-section">
            <div class="vlx-label">Kota</div>
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

        <!-- TIKET -->
        <div class="vlx-pane" id="vlx-pane-tiket">
          <div class="vlx-section">
            <div class="vlx-label">Hari</div>
            <div class="vlx-field">
              <select id="vlx-day">
                <option value="haritwo">Hari 2</option>
                <option value="harione">Hari 1</option>
                <option value="any">Semua</option>
              </select>
            </div>
          </div>
          <div class="vlx-section">
            <div class="vlx-label">Tipe Tiket</div>
            <div class="vlx-chips" id="vlx-ticket-chips">
              ${[
                {v:'pink',c:'#ec4899'},{v:'red',c:'#ef4444'},{v:'blue',c:'#3b82f6'},
                {v:'green',c:'#22c55e'},{v:'yellow',c:'#eab308'},{v:'purple',c:'#a855f7'},
                {v:'orange',c:'#f97316'},{v:'white',c:'#e2e8f0'},{v:'grey',c:'#6b7280'}
              ].map(t => `<div class="vlx-chip ${cfg.ticketTypes.includes(t.v)?'on':''}" data-type="${t.v}">
                <span class="vlx-chip-dot" style="background:${t.c}${t.v==='white'?';border:1px solid #444':''}"></span>
                ${t.v.toUpperCase()}
              </div>`).join('')}
            </div>
          </div>
          <div class="vlx-section">
            <div class="vlx-label">Jumlah</div>
            <div class="vlx-range-row">
              <input type="range" id="vlx-count" min="1" max="8" value="${cfg.ticketCount}"/>
              <span class="vlx-range-val" id="vlx-count-val">${cfg.ticketCount}×</span>
            </div>
          </div>
          <div class="vlx-section">
            <div class="vlx-label">Strategi</div>
            <div class="vlx-field">
              <select id="vlx-strategy">
                <option value="first-available">Pertama tersedia</option>
                <option value="highest-tier">Tier tertinggi</option>
                <option value="lowest-tier">Tier terendah</option>
                <option value="random">Random</option>
              </select>
            </div>
          </div>
        </div>

        <!-- ADVANCED -->
        <div class="vlx-pane" id="vlx-pane-adv">
          <div class="vlx-section">
            <div class="vlx-label">Timing</div>
            <div class="vlx-field"><label>Check interval</label>
              <div class="vlx-range-row">
                <input type="range" id="vlx-interval" min="100" max="2000" step="100" value="${cfg.checkInterval}"/>
                <span class="vlx-range-val" id="vlx-interval-val">${cfg.checkInterval}ms</span>
              </div>
            </div>
            <div class="vlx-field"><label>Delay konfirmasi</label>
              <div class="vlx-range-row">
                <input type="range" id="vlx-confirmdelay" min="200" max="3000" step="100" value="${cfg.confirmDelay}"/>
                <span class="vlx-range-val" id="vlx-confirmdelay-val">${cfg.confirmDelay}ms</span>
              </div>
            </div>
            <div class="vlx-field"><label>Delay TnC</label>
              <div class="vlx-range-row">
                <input type="range" id="vlx-tncdelay" min="100" max="1000" step="50" value="${cfg.tncDelay}"/>
                <span class="vlx-range-val" id="vlx-tncdelay-val">${cfg.tncDelay}ms</span>
              </div>
            </div>
          </div>
          <div class="vlx-section">
            <div class="vlx-label">Reload</div>
            <div class="vlx-toggle-row">
              <span class="vlx-toggle-label">Auto reload</span>
              <label class="vlx-sw"><input type="checkbox" id="vlx-autoreload" ${cfg.autoReload?'checked':''}/><span class="vlx-sw-slider"></span></label>
            </div>
            <div class="vlx-field" style="margin-top:8px"><label>Delay reload</label>
              <div class="vlx-range-row">
                <input type="range" id="vlx-reloaddelay" min="500" max="10000" step="500" value="${cfg.reloadDelay}"/>
                <span class="vlx-range-val" id="vlx-reloaddelay-val">${cfg.reloadDelay}ms</span>
              </div>
            </div>
            <div class="vlx-field" style="margin-top:8px"><label>Max retry (0=∞)</label>
              <input type="number" id="vlx-maxretry" value="${cfg.maxRetry}" min="0" max="100" style="width:70px"/>
            </div>
          </div>
          <div class="vlx-section">
            <div class="vlx-label">Lainnya</div>
            <div class="vlx-toggle-row">
              <span class="vlx-toggle-label">Notif suara</span>
              <label class="vlx-sw"><input type="checkbox" id="vlx-sound" ${cfg.soundAlert?'checked':''}/><span class="vlx-sw-slider"></span></label>
            </div>
            <div class="vlx-toggle-row" style="margin-top:4px">
              <span class="vlx-toggle-label">Auto confirm TnC</span>
              <label class="vlx-sw"><input type="checkbox" id="vlx-autoconfirm" ${cfg.autoConfirm?'checked':''}/><span class="vlx-sw-slider"></span></label>
            </div>
          </div>
        </div>

        <!-- LOG -->
        <div class="vlx-pane" id="vlx-pane-log">
          <div id="vlx-log-body"></div>
          <div style="padding:6px 10px;border-top:1px solid #1a1a2e">
            <button class="vlx-btn vlx-btn-stop" style="width:100%;padding:6px" onclick="document.getElementById('vlx-log-body').innerHTML=''">Hapus Log</button>
          </div>
        </div>

        <div class="vlx-btn-row">
          <button class="vlx-btn vlx-btn-save" id="vlx-save">💾 Simpan</button>
          <button class="vlx-btn vlx-btn-start" id="vlx-start">▶ Jalankan</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const toast = document.createElement('div');
    toast.className = 'vlx-toast';
    toast.id = 'vlx-toast';
    document.body.appendChild(toast);

    // Populate saved values
    document.getElementById('vlx-name').value = cfg.name;
    document.getElementById('vlx-email').value = cfg.email;
    document.getElementById('vlx-phone').value = cfg.phone;
    document.getElementById('vlx-city').value = cfg.cityValue;
    document.getElementById('vlx-day').value = cfg.ticketDay;
    document.getElementById('vlx-strategy').value = cfg.pickStrategy;

    // Tabs
    document.querySelectorAll('.vlx-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.vlx-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.vlx-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('vlx-pane-' + tab.dataset.pane).classList.add('active');
      });
    });

    // Collapse toggle
    document.getElementById('vlx-header').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });

    // Range displays
    const ranges = [
      ['vlx-count','vlx-count-val','×'],
      ['vlx-interval','vlx-interval-val','ms'],
      ['vlx-confirmdelay','vlx-confirmdelay-val','ms'],
      ['vlx-tncdelay','vlx-tncdelay-val','ms'],
      ['vlx-reloaddelay','vlx-reloaddelay-val','ms'],
    ];
    ranges.forEach(([id, vid, suffix]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => {
        document.getElementById(vid).textContent = el.value + suffix;
      });
    });

    // Ticket chips
    document.querySelectorAll('.vlx-chip').forEach(chip => {
      chip.addEventListener('click', () => chip.classList.toggle('on'));
    });

    // Save
    document.getElementById('vlx-save').addEventListener('click', () => {
      const newCfg = {
        name: document.getElementById('vlx-name').value.trim(),
        email: document.getElementById('vlx-email').value.trim(),
        phone: document.getElementById('vlx-phone').value.trim(),
        cityValue: document.getElementById('vlx-city').value,
        ticketDay: document.getElementById('vlx-day').value,
        ticketTypes: Array.from(document.querySelectorAll('.vlx-chip.on')).map(c => c.dataset.type),
        ticketCount: parseInt(document.getElementById('vlx-count').value),
        pickStrategy: document.getElementById('vlx-strategy').value,
        checkInterval: parseInt(document.getElementById('vlx-interval').value),
        confirmDelay: parseInt(document.getElementById('vlx-confirmdelay').value),
        tncDelay: parseInt(document.getElementById('vlx-tncdelay').value),
        autoReload: document.getElementById('vlx-autoreload').checked,
        reloadDelay: parseInt(document.getElementById('vlx-reloaddelay').value),
        soundAlert: document.getElementById('vlx-sound').checked,
        autoConfirm: document.getElementById('vlx-autoconfirm').checked,
        maxRetry: parseInt(document.getElementById('vlx-maxretry').value) || 0,
      };
      saveCfg(newCfg);
      cfg = newCfg;
      showToast('✅ Config tersimpan!');
    });

    // Start/Stop
    document.getElementById('vlx-start').addEventListener('click', () => {
      if (isRunning) { stopBot(); return; }
      // Auto-save first
      document.getElementById('vlx-save').click();
      setTimeout(startBot, 100);
    });
  }

  function updateBtnState(running) {
    const btn = document.getElementById('vlx-start');
    const dot = document.getElementById('vlx-dot');
    if (!btn) return;
    if (running) {
      btn.textContent = '⏹ Stop';
      btn.className = 'vlx-btn vlx-btn-stop';
      dot.classList.add('on');
    } else {
      btn.textContent = '▶ Jalankan';
      btn.className = 'vlx-btn vlx-btn-start';
      dot.classList.remove('on');
    }
  }

  function showToast(msg) {
    const t = document.getElementById('vlx-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  // Build panel when DOM is ready
  if (document.body) buildPanel();
  else window.addEventListener('DOMContentLoaded', buildPanel);

})();
