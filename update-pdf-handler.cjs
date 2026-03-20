const fs = require('fs');

let html = fs.readFileSync('get-hired-faster.html', 'utf8');

// handleFile fonksiyonunu güncelle - PDF'i backend'e gönder
const oldHandleFile = /function handleFile\(f\) \{[\s\S]*?f\.type === 'application\/pdf' \? r\.readAsDataURL\(f\) : r\.readAsText\(f\);[\s\S]*?\}/;

const newHandleFile = `async function handleFile(f) {
  if (!f) return;
  document.getElementById('fcName').textContent = f.name;
  document.getElementById('fileChip').classList.add('on');
  
  if (f.type === 'application/pdf') {
    // PDF'i backend'e gönder
    const formData = new FormData();
    formData.append('pdf', f);
    
    try {
      const res = await fetch('http://localhost:3001/api/parse-pdf', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error('PDF okunamadı');
      
      const data = await res.json();
      document.getElementById('cvArea').value = data.text.slice(0, 4000);
    } catch(e) {
      alert('PDF okunamadı: ' + e.message);
    }
  } else {
    // Text dosyası
    const r = new FileReader();
    r.onload = function(e) {
      document.getElementById('cvArea').value = e.target.result.slice(0, 4000);
    };
    r.readAsText(f);
  }
}`;

html = html.replace(oldHandleFile, newHandleFile);

fs.writeFileSync('get-hired-faster.html', html, 'utf8');
fs.writeFileSync('index.html', html, 'utf8');
console.log('✓ PDF handler güncellendi!');
