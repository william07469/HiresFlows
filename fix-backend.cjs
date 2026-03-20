// Bu script get-hired-faster.html dosyasını backend kullanacak şekilde günceller
const fs = require('fs');

let html = fs.readFileSync('get-hired-faster.html', 'utf8');

// 1. callClaude fonksiyonunu değiştir - backend'i kullan
const oldCallClaude = /async function callClaude\(prompt, key\) \{[\s\S]*?throw new Error\('Google Gemini API Hatası: ' \+ e\.message\);[\s\S]*?\}[\s\S]*?\}/;

const newCallClaude = `async function callClaude(prompt, key) {
  try {
    const res = await fetch('http://localhost:3000/api/fix-cv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || 'Error ' + res.status);
    }

    return await res.json();

  } catch(e) {
    throw new Error('API Hatası: ' + e.message);
  }
}`;

html = html.replace(oldCallClaude, newCallClaude);

// 2. doFix içindeki API key kontrolünü kaldır
html = html.replace(
  /if \(!_key\) \{[\s\S]*?err\.textContent = 'API key gerekli[^']+';[\s\S]*?err\.classList\.add\('on'\);[\s\S]*?return;[\s\S]*?\}/,
  '// API key kontrolü artık backend\'de'
);

fs.writeFileSync('get-hired-faster.html', html, 'utf8');
console.log('✓ get-hired-faster.html güncellendi!');
