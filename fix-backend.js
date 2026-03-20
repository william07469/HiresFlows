// Bu script get-hired-faster.html dosyasını backend kullanacak şekilde günceller
const fs = require('fs');

let html = fs.readFileSync('get-hired-faster.html', 'utf8');

// 1. API key değişkenini kaldır
html = html.replace(
  /var _key\s*=\s*sessionStorage\.getItem\('ghf_k'\)\s*\|\|\s*'[^']+';/,
  '// API key artık backend\'de tutuluyor'
);

// 2. saveKey fonksiyonunu kaldır
html = html.replace(
  /function saveKey\(\) \{[^}]+\}/s,
  '// saveKey fonksiyonu artık gerekli değil'
);

// 3. API key init kodunu kaldır
html = html.replace(
  /if \(_key\) \{[^}]+document\.getElementById\('saveKeyBtn'\)\.classList\.add\('saved'\);[^}]+\}/s,
  '// API key UI artık yok'
);

// 4. callClaude fonksiyonunu değiştir
html = html.replace(
  /async function callClaude\(prompt, key\) \{[\s\S]+?catch\(e\) \{[\s\S]+?\}\s*\}/,
  `async function callClaude(prompt, key) {
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
}`
);

// 5. doFix içindeki key kontrolünü kaldır
html = html.replace(
  /if \(!_key\) \{[\s\S]+?err\.classList\.add\('on'\);[\s\S]+?return;[\s\S]+?\}/,
  '// API key kontrolü artık gerekli değil - backend\'de'
);

fs.writeFileSync('get-hired-faster.html', html, 'utf8');
console.log('✓ get-hired-faster.html güncellendi!');
