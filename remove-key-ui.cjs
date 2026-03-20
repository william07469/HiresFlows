const fs = require('fs');

let html = fs.readFileSync('get-hired-faster.html', 'utf8');

// API key UI elementlerini kaldır
html = html.replace(
  /<div class="key-row">[\s\S]*?<\/div>\s*<div class="credits"/,
  '<div class="credits"'
);

// saveKey onclick'i kaldır
html = html.replace(/onclick="saveKey\(\)"/g, '');

// apiInput referanslarını kaldır
html = html.replace(
  /if \(_key\) \{[\s\S]*?document\.getElementById\('apiInput'\)\.value = _key;[\s\S]*?\}/,
  '// API key UI kaldırıldı'
);

fs.writeFileSync('get-hired-faster.html', html, 'utf8');
console.log('✓ API key UI kaldırıldı!');
