# CV Fixer Backend

## Kurulum

1. Bağımlılıkları yükle:
```bash
npm install
```

2. `.env` dosyasına API anahtarını ekle:
```
GEMINI_API_KEY=buraya_yeni_api_anahtarini_yaz
```

3. Sunucuyu başlat:
```bash
npm start
```

4. Tarayıcıda aç:
```
http://localhost:3000
```

## Önemli Notlar

- API anahtarı artık `.env` dosyasında güvenli şekilde tutuluyor
- Sunucu `http://localhost:3000` adresinde çalışıyor
- `index.html` basitleştirilmiş test arayüzü
- `get-hired-faster.html` orijinal tam özellikli arayüz (backend'e bağlanması gerekiyor)

## API Endpoint

POST `/api/fix-cv`
```json
{
  "prompt": "CV metnin ve talimatlar"
}
```
