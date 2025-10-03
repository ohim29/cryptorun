# BSC Subscription Gate (5 min) — Static Frontend

Готовый фронт под **GitHub Pages**: сайт работает в обычном режиме **5 минут**, затем показывается незакрываемая модалка **«ПРОЙТИ РЕГИСТРАЦИЮ»** с оплатой BSC (5 USDT) и формой регистрации.

> ⚠️ В этом билде проверка оплаты — **демо** (по кнопке «Я оплатил(а)» ставится флаг в `localStorage`). Для прод‑автопроверки подключи бэкенд (Ankr/ethers).

## Функции
- Таймер 5 минут от открытия вкладки (`sessionStorage`), точный `setTimeout` + watchdog.
- Модалка не закрывается (нет ESC/клика мимо/«позже»).
- Разблокировка только при двух флагах в `localStorage`:
  - `crt_sub_active === '1'` (оплата),
  - `crt_user_registered === '1'` (регистрация).

## Быстрый запуск локально
Просто открой `index.html` двойным кликом, либо подними статический сервер:
```bash
# Python 3
python3 -m http.server 5500
# и открой http://localhost:5500
```

## Деплой на GitHub Pages
1. Создай новый репозиторий на GitHub, например: `bsc-subscription-gate`.
2. Скопируй файлы из этого архива в корень репозитория (включая `index.html`).  
3. Закоммить и запушь:
```bash
git init
git add .
git commit -m "initial: bsc gate 5min"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
4. В настройках репозитория → **Pages**:  
   - **Source:** *Deploy from a branch*  
   - **Branch:** *main / root*
5. Страница будет доступна по `https://<user>.github.io/<repo>/`.

## Кастомизация
- **Время до блокировки:** в конце `index.html` найди блок `Strict 5-minute registration gate` и поменяй:
  ```js
  const MINUTES = 5; // поставить 10 и т.п.
  ```
- **Текст/стили модалки:** секции `#trialGate`, `.content`, `.col`, `.btn` в `<style>` рядом.
- **Адрес для оплаты:** элемент `<code id="gateAddr">…</code>` внутри секции оплаты.

## Подключение реальной автопроверки платежа (опционально)
- Подними наш бэкенд (Ankr + ethers): слушает `Transfer` у USDT на BSC к твоему адресу и активирует подписку.  
- Фронт будет опрашивать `/api/session/status` и сам снимет блокировку.  
Если нужно — дам отдельный репозиторий/бандл.

---
© 2025 — MIT License
