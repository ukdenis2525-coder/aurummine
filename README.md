# ⚡ AurumMine

Telegram Mini App для майнінгу TON на базі Power/Hashes механіки.

---

## 📁 Структура монорепозиторію

```
aurummine/                  ← корінь репо (GitHub)
├── backend/                ← Node.js API (Railway сервіс #1)
│   ├── src/
│   │   ├── index.js        ← точка входу + cron
│   │   ├── db.js           ← підключення PostgreSQL
│   │   ├── migrate.js      ← створення таблиць
│   │   ├── middleware/
│   │   │   └── auth.js     ← Telegram WebApp авторизація
│   │   ├── services/
│   │   │   └── mining.js   ← логіка нарахування хешів
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── mining.js
│   │       ├── shop.js
│   │       ├── withdraw.js
│   │       ├── referrals.js
│   │       ├── tasks.js
│   │       ├── leaderboard.js
│   │       └── admin.js
│   ├── .env.example
│   ├── package.json
│   └── railway.toml        ← конфіг деплою бекенду
├── frontend/               ← React + Vite (Railway сервіс #2)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── store/index.js  ← Zustand
│   │   ├── utils/api.js    ← axios + Telegram headers
│   │   └── components/
│   │       ├── layout/BottomNav.jsx
│   │       ├── ui/Loader.jsx
│   │       └── pages/
│   │           ├── PowerPage.jsx
│   │           ├── ShopPage.jsx
│   │           ├── TeamPage.jsx
│   │           ├── RatingPage.jsx
│   │           └── TasksPage.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── .env.example
│   ├── package.json
│   └── railway.toml        ← конфіг деплою фронтенду
├── .gitignore
├── package.json            ← workspace root
└── README.md
```

---

## 🚀 КРОК 1 — Telegram Bot

1. Відкрий [@BotFather](https://t.me/BotFather) в Telegram
2. Надішли `/newbot`
3. Введи назву: `AurumMine`
4. Введи username: `AurumMineBot` (або інший вільний)
5. **Збережи токен** — виглядає так: `7123456789:AAF...`
6. Надішли `/mybots` → вибери свого бота → `Bot Settings` → `Menu Button` → `Configure menu button`
7. Введи URL фронтенду (заповниш пізніше після деплою)

---

## 🚀 КРОК 2 — GitHub

```bash
# Розпакуй архів
unzip aurummine.zip
cd aurummine

# Ініціалізуй git
git init
git add .
git commit -m "init: AurumMine project"

# Створи репо на github.com (назва: aurummine)
# Потім:
git remote add origin https://github.com/ТВІЙ_ЮЗЕР/aurummine.git
git branch -M main
git push -u origin main
```

---

## 🚀 КРОК 3 — Railway: Backend

### 3.1 Створи проект

1. Зайди на [railway.app](https://railway.app) → `New Project`
2. Вибери `Deploy from GitHub repo`
3. Авторизуй GitHub → вибери репо `aurummine`
4. Railway запитає який folder — вкажи **`backend`**

### 3.2 Додай PostgreSQL

1. В проекті натисни `+ New` → `Database` → `Add PostgreSQL`
2. Railway автоматично додасть `DATABASE_URL` в env

### 3.3 Env Variables для Backend

Йди в свій backend сервіс → вкладка `Variables` → додай:

| Variable | Значення |
|----------|----------|
| `BOT_TOKEN` | токен від BotFather (крок 1) |
| `BOT_USERNAME` | username бота без @ (наприклад `AurumMineBot`) |
| `ADMIN_KEY` | придумай секретний рядок (наприклад `mySecretKey123`) |
| `NODE_ENV` | `production` |

> `DATABASE_URL` Railway додає автоматично — нічого не треба робити.

### 3.4 Запусти міграції

Після першого деплою (зачекай ~2 хв) → вкладка `Settings` → `Deploy` → знайди розділ або зайди в Shell:

```bash
npm run migrate
```

Або через Railway CLI:
```bash
railway run --service backend npm run migrate
```

### 3.5 Скопіюй URL бекенду

Вкладка `Settings` → `Networking` → `Public Networking` → `Generate Domain`
Отримаєш щось на кшталт: `https://aurummine-backend-xxxx.up.railway.app`

---

## 🚀 КРОК 4 — Railway: Frontend

### 4.1 Додай другий сервіс

В тому ж Railway проекті → `+ New` → `GitHub Repo` → знову вибери `aurummine` → folder: **`frontend`**

### 4.2 Env Variables для Frontend

| Variable | Значення |
|----------|----------|
| `VITE_API_URL` | `https://ТВІЙ-BACKEND.up.railway.app/api` |

### 4.3 Domain для Frontend

Вкладка `Settings` → `Networking` → `Generate Domain`
Отримаєш: `https://aurummine-frontend-xxxx.up.railway.app`

---

## 🚀 КРОК 5 — Підключи Mini App до Бота

1. Зайди в [@BotFather](https://t.me/BotFather) → `/mybots` → вибери бота
2. `Bot Settings` → `Menu Button` → `Configure menu button`
3. Введи URL: `https://aurummine-frontend-xxxx.up.railway.app`
4. Введи текст кнопки: `⚡ Mine`

Або через `/newapp`:
1. `/newapp` → вибери бота
2. Заповни дані → Web App URL: `https://aurummine-frontend-xxxx.up.railway.app`

---

## 🚀 КРОК 6 — Перевірка

Відкрий бота в Telegram → натисни кнопку меню → Mini App має відкритися.

Перевір health бекенду:
```
GET https://ТВІЙ-BACKEND.up.railway.app/health
→ {"status":"ok"}
```

---

## 🔄 Оновлення коду

```bash
# Зроби зміни в коді
git add .
git commit -m "fix: something"
git push
```
Railway автоматично передеплоїть обидва сервіси.

---

## 🛠️ Admin API

Всі запити потребують заголовок: `x-admin-key: ТВІЙ_ADMIN_KEY`

```bash
# Список юзерів (50 на сторінку)
GET /api/admin/users?page=1

# Заявки на вивід
GET /api/admin/withdrawals?status=pending

# Підтвердити вивід
POST /api/admin/withdrawals/:id/approve
Body: { "tx_hash": "abc123..." }

# Відхилити вивід (баланс повертається)
POST /api/admin/withdrawals/:id/reject

# Змінити баланс юзера
POST /api/admin/users/:id/adjust
Body: { "power": 50000, "ton_balance": 1.5 }
```

---

## ⚙️ Механіка майнінгу

```
100K Power = 2500 HASHES / день
1 HASH = 0.0000144 TON
100K Power = 0.036 TON / день
Окупність 100K (0.85 TON): ~24 дні
```

Пакети:
| Пакет | Power | Ціна | TON/день | Окупність |
|-------|-------|------|----------|-----------|
| Starter | 10K | 0.10 TON | 0.0036 | ~28 днів |
| Basic | 100K | 0.85 TON | 0.036 | ~24 дні |
| Advanced | 500K | 3.50 TON | 0.18 | ~19 днів |
| Pro | 1M | 6.00 TON | 0.36 | ~17 днів |

Реферали:
- +3,000 Power за звичайного реферала
- +6,000 Power за Telegram Premium реферала
- 15% комісія з кожної покупки реферала

---

## ❓ Troubleshooting

**Build fails на Railway:**
- Перевір що вказав правильний root folder (`backend` або `frontend`)
- Перевір що `NODE_ENV=production` в env vars

**Frontend не з'єднується з backend:**
- Перевір `VITE_API_URL` — має закінчуватись на `/api`
- Перевір CORS — backend приймає всі origins

**Міграція не запускається:**
- Зачекай поки перший деплой завершиться
- Запусти вручну через Railway Shell: `node src/migrate.js`

**Telegram WebApp не відкривається:**
- URL в BotFather має бути HTTPS
- Railway надає HTTPS автоматично
