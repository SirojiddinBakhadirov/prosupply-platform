# ProSupply platformasi

Sayt + boşqaruv paneli + Telegram bot + PostgreSQL. Hammasi bitta serverda Docker orqali işlaydi.

```
prosupply-platform/
├── api/                 Backend (Node.js 22, Express, PostgreSQL)
│   ├── src/             server, API, avtorizatsiya, Telegram bot
│   └── migrations/      ma'lumotlar bazasi sxemasi (SQL)
├── web/
│   ├── site/            ommaviy sayt (UZ/RU) + maxfiylik siyosati
│   └── panel/           boşqaruv paneli  →  https://DOMEN/panel
├── deploy/
│   ├── Caddyfile        veb-server: HTTPS (avtomatik), /api → backend
│   └── backup.sh        kunlik zaxira nusxa
├── docker-compose.yml   db + api + web
└── .env.example         sozlamalar namunasi
```

## Nima işlaydi (1-bosqiç)

- **Sayt:** forma zayavkani PostgreSQL ga yozadi (rozilik belgisi, spamdan himoya, IP böyiça çeklov).
- **Telegram bot:** har bir yangi zayavka guruhga keladi, tugmalar bilan holatini özgartiriş mumkin (Işga oldim / KP yuborildi / Mijozga aylandi / Rad etildi). `/zayavkalar` — oxirgi 5 ta.
- **Panel:** kiriş, zayavkalar röyxati, qidiruv, holat va izoh, özgarişlar tarixi, statistika; asoschi menejer va kuzatuvçi qöşa oladi.

## Işga tuşiriş tartibi

### 1. GitHub (kodni saqlaş)
1. https://github.com/signup da röyxatdan öting, 2 bosqiçli himoyani (2FA) yoqing.
2. **New repository** → nomi `prosupply-platform`, **Private** ni tanlang → Create.
3. Kompyuteringizda arxivni oçib, papka içida:
   ```
   git remote add origin https://github.com/LOGIN/prosupply-platform.git
   git push -u origin main
   ```
   (`.env` fayl gitga kirmaydi — parollar hech qaçon GitHubga çiqmaydi.)

### 2. Hosting (O'zbekistondagi VPS)
- Toşkentdagi data-markazda joylaşgan VPS: **Ubuntu 24.04, 2 vCPU, 2–4 GB RAM, 40 GB SSD**, statik IP.
- Kirişni SSH kalit orqali qiling, parol bilan kirişni öçiring.
- Serverda:
  ```
  curl -fsSL https://get.docker.com | sh
  sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
  ```

### 3. Domen
1. `.uz` domenini akkreditatsiyadan ötgan registrator orqali oling (röyxat: cctld.uz).
2. DNS da ikkita **A** yozuv: `@` → VPS IP, `www` → VPS IP.

### 4. Serverga joylaş
```
sudo mkdir -p /opt/prosupply && sudo chown $USER /opt/prosupply
git clone https://github.com/LOGIN/prosupply-platform.git /opt/prosupply
cd /opt/prosupply
cp .env.example .env && nano .env      # DOMAIN, parollar, SESSION_SECRET
openssl rand -hex 32                    # SESSION_SECRET va POSTGRES_PASSWORD uçun
docker compose up -d --build
docker compose logs -f api              # "migratsiya bajarildi", "admin yaratildi" körinişi kerak
```
HTTPS sertifikatini Caddy özi oladi (domen DNS i serverga qaragan bölişi kerak).

### 5. Telegram bot
1. Telegramda **@BotFather** → `/newbot` → token oling → `.env` dagi `TELEGRAM_BOT_TOKEN` ga yozing.
2. Jamoa uçun guruh oçing, botni qöşing, guruhda `/start` yozing — bot guruh ID sini körsatadi.
3. Uni `TELEGRAM_CHAT_ID` ga yozing va `docker compose up -d` bilan qayta işga tuşiring.

### 6. Zaxira nusxa
```
crontab -e
30 2 * * * /opt/prosupply/deploy/backup.sh
```
Haftada bir marta `backups/` papkasidan bitta faylni boşqa joyga (kompyuter yoki bulut) ham köçiring.

### Yangilaş
```
cd /opt/prosupply && git pull && docker compose up -d --build
```

## Huquqiy eslatma
Sayt mijozlarning ismi va telefonini saqlaydi. "Shaxsga doir ma'lumotlar to'g'risida"gi qonunning 27¹-moddasi (2026-yildagi özgarişlar bilan) talablarini, jumladan ma'lumotlar bazasini davlat reyestrida röyxatdan ötkaziş zaruratini işga tuşirişdan oldin lex.uz dagi amaldagi tahrir böyiça tekşiring: https://lex.uz/docs/-4396419

## Keyingi bosqiçlar
- **2-bosqiç:** boşqaruv ilovasini (katalog, yetkazib beruvçilar, mijozlar, buyurtmalar, tölovlar, vozvratlar, reyslar) PostgreSQL ga köçiriş.
- **3-bosqiç:** AI agentlar va majlis — Anthropic API kaliti orqali (pullik, foydalaniş böyiça).
- **4-bosqiç:** botga buyurtma holati, ertalabki hisobot, mijozga KP yuboriş.
