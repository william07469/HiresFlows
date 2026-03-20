const fs = require('fs');

let html = fs.readFileSync('get-hired-faster.html', 'utf8');

// 1. _key değişkenini tamamen kaldır
html = html.replace(
  /var _key\s*=\s*[^;]+;/,
  '// API key backend\'de'
);

// 2. saveKey fonksiyonunu tamamen kaldır
html = html.replace(
  /function saveKey\(\) \{[\s\S]*?\n\}/,
  ''
);

// 3. Init içindeki API key kodunu kaldır
html = html.replace(
  /if \(_key\) \{[\s\S]*?b\.classList\.add\('saved'\);[\s\S]*?\}/,
  ''
);

// 4. doFix içindeki _key kontrolünü kaldır
html = html.replace(
  /if \(!_key\) \{[\s\S]*?return;[\s\S]*?\}/,
  ''
);

// 5. callClaude çağrısını güncelle - key parametresini kaldır
html = html.replace(
  /await callClaude\(prompt, _key\)/g,
  'await callClaude(prompt)'
);

// 6. callClaude fonksiyon imzasını güncelle
html = html.replace(
  /async function callClaude\(prompt, key\)/,
  'async function callClaude(prompt)'
);

// 7. callClaude içindeki key kontrolünü kaldır
html = html.replace(
  /if \(!key\) throw new Error\('NO_KEY'\);[\s\S]*?\n/,
  ''
);

fs.writeFileSync('get-hired-faster.html', html, 'utf8');
fs.writeFileSync('index.html', html, 'utf8');
console.log('✓ Tüm API key referansları kaldırıldı!');
