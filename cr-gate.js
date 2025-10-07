
(() => {
  const CLIENT_ID = "476999071064-6bj2lf4krev1qn0g51pm3ocitdmgntkj.apps.googleusercontent.com";
  const FIREBASE_CFG = {"apiKey": "AIzaSyDzczjOkUpjRkpHxnAzr6lgvMjgIt2A6Vc", "authDomain": "cryptorun-9e8f9.firebaseapp.com", "projectId": "cryptorun-9e8f9", "storageBucket": "cryptorun-9e8f9.firebasestorage.app", "messagingSenderId": "831650727451", "appId": "1:831650727451:web:a4f1e325fa878b77f89abe", "measurementId": "G-3B1CP97094"};
  const WALLET = "0xD2471faD1f058fD01591364651619Bb6D59d5405";
  const LS = { FIRST:'CR_FIRST_SEEN_TS', REG:'CR_REGISTERED' };
  const FIVE_MIN = 5*60*1000;

  const now = () => Date.now();
  const $ = s => document.querySelector(s);
  const show = el => el && (el.style.display='flex');
  const hide = el => el && (el.style.display='none');

  // inject overlays
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="cr-spinner-overlay" id="cr-spin"><div class="cr-spinner"></div></div>
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

  // init Firebase (auth + firestore)
  try { firebase.initializeApp(FIREBASE_CFG); } catch(_){}
  const auth = firebase.auth();
  const db = firebase.firestore ? firebase.firestore() : null;

  const spin = { on:()=>show($('#cr-spin')), off:()=>hide($('#cr-spin')) };

  // Google flow -> Firebase Auth credential
  async function onGoogle(resp){
    try{
      if(!resp || !resp.credential) return;
      const cred = firebase.auth.GoogleAuthProvider.credential(resp.credential);
      spin.on();
      const uc = await auth.signInWithCredential(cred);
      await postLogin(uc.user);
    }catch(e){ console.error(e); } finally{ spin.off(); }
  }
  function initGoogle(){
    const t=setInterval(()=>{
      if(window.google && google.accounts && google.accounts.id){
        clearInterval(t);
        google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onGoogle, auto_select:false });
        const a=document.getElementById('gsiInline'), b=document.getElementById('cr-gsi-gate');
        a && google.accounts.id.renderButton(a, { theme:'outline', size:'large', text:'signup_with' });
        b && google.accounts.id.renderButton(b, { theme:'outline', size:'large', text:'signup_with' });
      }
    },80);
    setTimeout(()=>clearInterval(t),10000);
  }

  function bindEmailGate(){
    const ge=$('#cr-gate-email'), gp=$('#cr-gate-pass'), info=$('#cr-auth-gate-info');
    const sUp=$('#cr-gate-signup'), sIn=$('#cr-gate-signin');
    sUp && (sUp.onclick = async ()=>{ try{ spin.on(); const r=await auth.createUserWithEmailAndPassword(ge.value,gp.value); await postLogin(r.user);}catch(e){ info&&(info.textContent='Ошибка: '+e.message);} finally{ spin.off(); } });
    sIn && (sIn.onclick = async ()=>{ try{ spin.on(); const r=await auth.signInWithEmailAndPassword(ge.value,gp.value); await postLogin(r.user);}catch(e){ info&&(info.textContent='Ошибка: '+e.message);} finally{ spin.off(); } });
  }

  async function postLogin(user){
    localStorage.setItem(LS.REG,'1');
    hide($('#cr-auth-overlay'));
    if (!db) { openPay(); return; }
    const ref = db.collection('users').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ firstSeen: firebase.firestore.FieldValue.serverTimestamp(), paidUntil: null }, { merge:true });
    }
    const data = (await ref.get()).data()||{};
    let paidUntil = data.paidUntil;
    if (paidUntil && paidUntil.toMillis) paidUntil = paidUntil.toMillis();
    if (!paidUntil || paidUntil < Date.now()) openPay();
  }

  function openPay(){
    const w=$('#cr-wallet'), qr=$('#cr-qr');
    w && (w.value = WALLET);
    qr && (qr.src='https://api.qrserver.com/v1/create-qr-code/?size=140x140&data='+encodeURIComponent(WALLET));
    show($('#cr-pay-overlay'));
  }
  function bindPay(){
    const copy=$('#cr-copy'), tx=$('#cr-txid'), info=$('#cr-pay-info');
    copy && (copy.onclick = async ()=>{ try{ await navigator.clipboard.writeText(WALLET); info&&(info.textContent='Адрес скопирован'); }catch(_){ info&&(info.textContent='Скопируйте адрес вручную'); } });
    const paid=$('#cr-paid');
    paid && (paid.onclick = async ()=>{
      const v=(tx&&tx.value.trim())||'';
      if(!v){ info&&(info.textContent='Введите TxID / Hash'); return; }
      if (auth.currentUser && db){
        const ref = db.collection('users').doc(auth.currentUser.uid);
        const until = new Date(Date.now()+30*24*60*60*1000);
        await ref.set({ paidUntil: until }, { merge:true });
      }
      info&&(info.textContent='Оплата отмечена. Доступ активирован на 30 дней.');
      setTimeout(()=>hide($('#cr-pay-overlay')), 800);
    });
  }

  
  // Timer logic:
  // - First ever visit: wait 5 minutes, then show auth
  // - Any reload/next visits: show auth immediately (no free time again)
  function scheduleGate(){
    try {
      if (localStorage.getItem(LS.FIRST)) {
        const el = document.getElementById('cr-auth-overlay');
        if (el) el.style.display = 'flex';
        return;
      }
      localStorage.setItem(LS.FIRST, String(Date.now()));
      setTimeout(() => {
        const el = document.getElementById('cr-auth-overlay');
        if (el) el.style.display = 'flex';
      }, 5*60*1000);
    } catch (e) {
      const el = document.getElementById('cr-auth-overlay');
      if (el) el.style.display = 'flex';
    }
  }


  window.addEventListener('load', ()=>{
    if(!document.querySelector('script[src*="gsi/client"]')){
      const s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.async=true; s.defer=true; document.head.appendChild(s);
    }
    initGoogle();
    bindEmailGate();
    bindPay();

    spin.on();
    auth.onAuthStateChanged(async (user)=>{
      try{
        if(user){
          if (db){
            const ref=db.collection('users').doc(user.uid);
            const snap=await ref.get();
            const data=snap.data()||{};
            let paidUntil=data.paidUntil;
            if (paidUntil && paidUntil.toMillis) paidUntil = paidUntil.toMillis();
            if (!paidUntil || paidUntil < Date.now()) openPay();
          } else {
            openPay();
          }
        } else {
          scheduleGate();
        }
      } finally { spin.off(); }
    });
  });
})();
