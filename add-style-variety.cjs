const fs = require('fs');

let server = fs.readFileSync('server.js', 'utf8');

// Import ekle
if (!server.includes("import { selectRandomStyle }")) {
  server = server.replace(
    "import { calculateATSScore",
    "import { selectRandomStyle } from './cv-styles.js';\nimport { calculateATSScore"
  );
}

// Style selection ekle (atsPass'den sonra)
server = server.replace(
  /const atsPass = predictATSPass\(beforeAnalysis\);/,
  `const atsPass = predictATSPass(beforeAnalysis);
    const selectedStyle = selectRandomStyle();`
);

// Model config'e temperature ekle
server = server.replace(
  /model: 'gemini-2\.5-flash',/,
  `model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 1.2,
        topP: 0.95,
        topK: 40
      },`
);

// Console log'a style ekle
server = server.replace(
  /console\.log\('  💡 İyileştirmeler:', improvements\.length, 'öneri\\n'\);/,
  `console.log('  💡 İyileştirmeler:', improvements.length, 'öneri');
    console.log('  🎨 Seçilen Tarz:', selectedStyle.name, '-', selectedStyle.description, '\\n');`
);

// Prompt'a style bilgisi ekle - string concatenation kullan
server = server.replace(
  /const enhancedPrompt = `### ROLE:/,
  `const enhancedPrompt = \`### WRITING STYLE FOR THIS VERSION:
Style: \${selectedStyle.name}
Tone: \${selectedStyle.tone}
Focus: \${selectedStyle.focus}
Bullet Format: \${selectedStyle.bulletStyle}
Example: "\${selectedStyle.example}"

USE THIS STYLE CONSISTENTLY throughout the rewrite. Make it feel unique and different from generic CV templates.

### ROLE:`
);

fs.writeFileSync('server.js', server, 'utf8');
console.log('✓ Style variety eklendi!');
