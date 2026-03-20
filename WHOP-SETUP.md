# Whop Satış Kurulum Rehberi

## ⚡ Hızlı Başlangıç (5 Adım)

### 1. Whop Dashboard Ayarları

1. [dash.whop.com](https://dash.whop.com) → giriş yap
2. **Products** → **Create Product**:
   - **Starter**: $9, one-time, 5 CV fixes
   - **Pro**: $19/month, recurring, unlimited
3. **Settings** → **Developer** → **API Keys** → yeni key oluştur
4. **Settings** → **Webhooks** → **Add Webhook**:
   - URL: `https://yourdomain.com/api/whop-webhook`
   - Events: `payment.succeeded`, `checkout.session.completed`
   - Secret kopyala

### 2. .env Dosyası Doldur

```env
GEMINI_API_KEY=AIzaSy...    # Google AI Studio'dan al
WHOP_API_KEY=apik_...        # Whop Dashboard → Developer → API Keys
WHOP_COMPANY_ID=biz_...      # Whop Dashboard → Company Settings
WHOP_WEBHOOK_SECRET=...      # Whop Dashboard → Webhooks → Secret

# Production'da ekle:
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production
PORT=3001
```

### 3. Test Et

```bash
npm start
# http://localhost:3001
```

### 4. Deploy Et

**Railway.app (Önerilen):**
```bash
# 1. GitHub'a push et
# 2. railway.app → New Project → Deploy from GitHub
# 3. Environment Variables ekle (.env'deki tüm değişkenler)
# 4. Deploy → domain al
```

**Render.com:**
```bash
# 1. render.com → New Web Service
# 2. Build Command: npm install
# 3. Start Command: node server.js
# 4. Environment Variables ekle
```

### 5. Whop Dashboard'da Link Güncelle

1. Webhook URL'ini güncelle: `https://your-app.railway.app/api/whop-webhook`
2. Whop product page'de checkout link'ini kullan

---

## 🔄 Nasıl Çalışır

```
Kullanıcı                  Sizin Sunucu              Whop
   │                           │                        │
   ├──► "Fix My CV" ──────────►│                        │
   │◄── 1 free kredi ──────────│                        │
   │                           │                        │
   ├──► Kredi bitince ────────►│──► Checkout oluştur ──►│
   │◄── Whop checkout URL ─────│◄── URL döndür ────────│
   │                           │                        │
   ├─── Whop'ta ödeme ───────────────────────────────────►│
   │                           │◄── Webhook ────────────│
   │                           │──► Kredi ver ──────────│
   │◄── Devam edebilir ────────│                        │
```

## 💰 Fiyatlandırma Yapısı

| Plan | Fiyat | Özellik |
|------|-------|---------|
| **Free** | $0 | 1 CV fix |
| **Starter** | $9 | 5 CV fix (one-time) |
| **Pro** | $19/month | Sınırsız CV fix |

## 🔐 Güvenlik

- ✅ Webhook HMAC-SHA256 imza doğrulama
- ✅ Rate limiting (20 req/dakika)
- ✅ CORS whitelist
- ✅ Input validation & sanitization
- ✅ HTTP security headers
- ✅ Server-side kredi takibi (client bypass edemez)

## 📊 API Endpoints

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/me` | GET | Kullanıcı durumu, kredi bilgisi |
| `/api/plans` | GET | Plan bilgileri |
| `/api/fix-cv` | POST | CV düzeltme (kredi gerektirir) |
| `/api/scan-keywords` | POST | ATS keyword analizi (ücretsiz) |
| `/api/parse-pdf` | POST | PDF okuma (ücretsiz) |
| `/api/job-suggestions` | POST | Becerilere göre iş önerileri |
| `/api/job-suggestions-ai` | POST | AI ile iş önerileri (Gemini) |
| `/api/generate-cover-letter` | POST | Cover letter (kredi gerektirir) |
| `/api/generate-interview-prep` | POST | Interview prep (kredi gerektirir) |
| `/api/create-checkout` | POST | Whop checkout session oluştur |
| `/api/whop-webhook` | POST | Whop ödeme bildirimi |

## ⚠️ Bilinen Eksikler (Production Öncesi)

1. **In-memory kullanıcı store** — Sunucu restart olunca kaybolur
   - Çözüm: PostgreSQL, Redis, veya SQLite ekle
2. **Whop SDK versiyonu** — `@whop/sdk@0.0.35` eski olabilir
   - `npm update @whop/sdk` çalıştır
3. **Subscription renewal** — Pro plan yenileme takibi yok
   - `subscription.renewed` webhook event'ini dinle
4. **Email bildirimi** — Ödeme sonrası kullanıcıya email gitmiyor (Whop otomatik gönderir)

## Kaynaklar

- [Whop Developer Docs](https://docs.whop.com/developer)
- [Whop API Reference](https://dev.whop.com)
- [Railway Deploy Guide](https://docs.railway.app)
