
(() => {
  const CLIENT_ID = "476999071064-6bj2lf4krev1qn0g51pm3ocitdmgntkj.apps.googleusercontent.com";
  const FIREBASE_CFG = {"apiKey": "AIzaSyDzczjOkUpjRkpHxnAzr6lgvMjgIt2A6Vc", "authDomain": "cryptorun-9e8f9.firebaseapp.com", "projectId": "cryptorun-9e8f9", "storageBucket": "cryptorun-9e8f9.firebasestorage.app", "messagingSenderId": "831650727451", "appId": "1:831650727451:web:a4f1e325fa878b77f89abe", "measurementId": "G-3B1CP97094"};
  const WALLET = "0xD2471faD1f058fD01591364651619Bb6D59d5405";
  const LS = { FIRST:'CR_FIRST_SEEN_TS', REG:'CR_REGISTERED', PAID:'CR_PAID', PAID_UNTIL:'CR_PAID_UNTIL' };
  const FIVE_MIN = 5*60*1000, THIRTY_D = 30*24*60*60*1000;
  const now = () => Date.now();
  const $ = (s) => document.querySelector(s);
  const lock = (on) => document.documentElement.style.overflow = on ? 'hidden' : 'auto';
  const show = (el) => { el && (el.style.display='flex', lock(true)); };
  const hide = (el) => { el && (el.style.display='none', lock(false)); };
  const isRegistered = () => localStorage.getItem(LS.REG)==='1';
  const markRegistered = () => localStorage.setItem(LS.REG,'1');
  const hasActivePaid = () => { const u = parseInt(localStorage.getItem(LS.PAID_UNTIL)||'0',10); return u && u > now(); };

  // Ensure SDKs present (already loaded from <head>)
  try { firebase.initializeApp(FIREBASE_CFG); } catch(_){}
  const auth = firebase.auth ? firebase.auth() : null;

  // --- Inject overlays ---
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <div class="cr-overlay" id="cr-auth-overlay" aria-modal="true" role="dialog">
    <div class="cr-panel">
      <h2>Требуется регистрация</h2>
      <p style="opacity:.8">Вы пользуетесь приложением уже 5 минут. Войдите через Google или по e‑mail, чтобы продолжить.</p>
      <div id="cr-gsi-gate"></div>
      <div class="cr-sep"></div>
      <div class="cr-row">
        <input id="cr-gate-email" class="cr-input" type="email" placeholder="you@email.com" />
        <input id="cr-gate-pass" class="cr-input" type="password" placeholder="••••••••" />
        <button id="cr-gate-signup" class="cr-btn">Зарегистрироваться</button>
        <button id="cr-gate-signin" class="cr-btn cr-btn-outline">Войти</button>
      </div>
      <div id="cr-auth-gate-info" style="margin-top:8px;opacity:.8"></div>
    </div>
  </div>
  <div class="cr-overlay" id="cr-pay-overlay" aria-modal="true" role="dialog">
    <div class="cr-panel">
      <h2>Оплата подписки 5 USDT / месяц</h2>
      <div class="cr-row" style="margin:6px 0 10px">
        <span class="cr-tag">Сеть: BSC (BEP20)</span>
        <span class="cr-tag">Сумма: 5 USDT</span>
      </div>
      <div class="cr-row">
        <input id="cr-wallet" class="cr-input" readonly value="0xD2471faD1f058fD01591364651619Bb6D59d5405" />
        <button class="cr-copy" id="cr-copy">Скопировать</button>
      </div>
      <div class="cr-grid" style="margin-top:12px">
        <div><img id="cr-qr" alt="QR" style="width:140px;height:140px;border-radius:10px;border:1px solid #334155"></div>
        <div style="opacity:.9">
          Отсканируйте QR для перевода на адрес. В комментарии платежа укажите TxID/Hash.
          <div class="cr-sep"></div>
          <div>TxID / Hash</div>
          <input id="cr-txid" class="cr-input" placeholder="Введите TxID или Hash" />
          <div class="cr-sep"></div>
          <button id="cr-paid" class="cr-btn" style="width:100%">Я оплатил(а)</button>
          <div id="cr-pay-info" style="margin-top:8px;opacity:.85"></div>
        </div>
      </div>
      <p style="margin-top:12px;opacity:.7">После подтверждения оплата активирует доступ на 30 дней.</p>
    </div>
  </div>`;
  document.body.appendChild(wrap);

  // --- Email in overlay ---
  function bindEmailGate(){
    const ge=$('#cr-gate-email'), gp=$('#cr-gate-pass'), info=$('#cr-auth-gate-info');
    const sUp=$('#cr-gate-signup'), sIn=$('#cr-gate-signin');
    const authEl=$('#cr-auth-overlay');
    if(!auth) return;
    sUp && (sUp.onclick = async ()=>{ try{ const u=await auth.createUserWithEmailAndPassword(ge.value,gp.value); markRegistered(); info&&(info.textContent='Регистрация: '+(u.user.email||'')); hide(authEl); if(!hasActivePaid()) openPay(); }catch(e){ info&&(info.textContent='Ошибка: '+e.message); } });
    sIn && (sIn.onclick = async ()=>{ try{ const u=await auth.signInWithEmailAndPassword(ge.value,gp.value); markRegistered(); info&&(info.textContent='Вход: '+(u.user.email||'')); hide(authEl); if(!hasActivePaid()) openPay(); }catch(e){ info&&(info.textContent='Ошибка: '+e.message); } });
  }

  // --- Google Identity ---
  function parseJwt (t) { try { return JSON.parse(atob(t.split('.')[1])); } catch(_){ return null; } }
  function onGoogle(resp){ if(!resp.credential) return; markRegistered(); hide(document.getElementById('cr-auth-overlay')); if(!hasActivePaid()) openPay(); }
  function initGoogle(){
    const t=setInterval(()=>{
      if(window.google && google.accounts && google.accounts.id){
        clearInterval(t);
        google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onGoogle, auto_select:false });
        const a=document.getElementById('gsiInline'), b=document.getElementById('cr-gsi-gate');
        if (a) google.accounts.id.renderButton(a, { theme:'outline', size:'large', text:'signup_with' });
        if (b) google.accounts.id.renderButton(b, { theme:'outline', size:'large', text:'signup_with' });
      }
    },60);
    setTimeout(()=>clearInterval(t),8000);
  }

  // --- Payment ---
  function openPay(){
    const pay=document.getElementById('cr-pay-overlay'); const qr=document.getElementById('cr-qr'); const wallet=document.getElementById('cr-wallet');
    if(qr) qr.src='https://api.qrserver.com/v1/create-qr-code/?size=140x140&data='+encodeURIComponent(WALLET);
    if(wallet) wallet.value=WALLET;
    show(pay);
  }
  function bindPay(){
    const copyBtn=document.getElementById('cr-copy'); const tx=document.getElementById('cr-txid'); const info=document.getElementById('cr-pay-info'); const pay=document.getElementById('cr-pay-overlay');
    copyBtn && (copyBtn.onclick=async()=>{ try{ await navigator.clipboard.writeText(WALLET); info&&(info.textContent='Адрес скопирован'); }catch(_){ info&&(info.textContent='Скопируйте адрес вручную'); } });
    const paidBtn=document.getElementById('cr-paid');
    paidBtn && (paidBtn.onclick=()=>{ const v=(tx&&tx.value.trim())||''; if(!v){ info&&(info.textContent='Введите TxID / Hash.'); return; } localStorage.setItem(LS.PAID,'1'); localStorage.setItem(LS.PAID_UNTIL,''+(now()+THIRTY_D)); info&&(info.textContent='Оплата отмечена. Доступ активирован на 30 дней.'); setTimeout(()=>hide(pay),600); });
  }

  // --- Timer & start ---
  function scheduleGate(){
    if(!localStorage.getItem(LS.FIRST)) localStorage.setItem(LS.FIRST,''+now());
    const rem=Math.max(0, FIVE_MIN-(now()-parseInt(localStorage.getItem(LS.FIRST),10)));
    if (isRegistered()) { if(!hasActivePaid()) openPay(); return; }
    if (rem===0) show(document.getElementById('cr-auth-overlay')); else setTimeout(()=>show(document.getElementById('cr-auth-overlay')), rem);
  }

  window.addEventListener('load', ()=>{ bindEmailGate(); initGoogle(); bindPay(); scheduleGate(); if(isRegistered() && !hasActivePaid()) openPay(); });
})();
