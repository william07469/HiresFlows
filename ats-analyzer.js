// Gelişmiş ATS Analiz Motoru
import { ATS_KEYWORDS, detectIndustry, extractATSKeywords, analyzeKeywordDensity } from './ats-keywords.js';

// Metinden skill'leri çıkar
export function extractSkills(text) {
  return extractATSKeywords(text);
}

// CV ve JD arasında gelişmiş keyword match
export function calculateKeywordMatch(cvText, jdText) {
  if (!jdText) return { score: 0, matched: [], missing: [], found: [], criticalMissing: [] };

  const cvKeywords = extractATSKeywords(cvText);
  const jdKeywords = extractATSKeywords(jdText);
  const density = analyzeKeywordDensity(cvText, jdText);

  // Tüm keyword'leri birleştir
  const cvAll = [...cvKeywords.technical, ...cvKeywords.tools, ...cvKeywords.actionVerbs];
  const jdAll = [...jdKeywords.technical, ...jdKeywords.tools, ...jdKeywords.actionVerbs];

  const matched = jdAll.filter(skill => cvAll.includes(skill));
  const missing = jdAll.filter(skill => !cvAll.includes(skill));

  // Density analizi varsa kullan
  let score = 0;
  if (density && typeof density.matchRate === 'number' && !isNaN(density.matchRate)) {
    score = density.matchRate;
  } else if (jdAll.length > 0) {
    score = Math.round((matched.length / jdAll.length) * 100);
  }

  const uniqueMatched = [...new Set(matched)];
  const uniqueMissing = [...new Set(missing)];

  return {
    score,
    matched: uniqueMatched,
    missing: uniqueMissing,
    found: uniqueMatched, // Alias for frontend compatibility
    criticalMissing: density ? density.criticalMissing : uniqueMissing.slice(0, 15),
    cvKeywords,
    jdKeywords,
    density
  };
}

// Gelişmiş ATS skorlama sistemi
export function calculateATSScore(cvText, jdText = '') {
  const cv = cvText.toLowerCase();
  let score = 0;
  const issues = [];
  const strengths = [];
  const recommendations = [];

  // Sektör tespiti
  const industry = detectIndustry(cvText);
  const cvKeywords = extractATSKeywords(cvText, industry);

  // 1. Format & Yapı (15 puan)
  const hasBullets = (cv.match(/[•\-\*]\s/g) || []).length >= 3;
  const hasSections = ['experience', 'education', 'skills', 'summary'].filter(s => cv.includes(s)).length;
  const hasContactInfo = cv.includes('@') || cv.includes('linkedin') || cv.includes('github');
  
  if (hasBullets && hasSections >= 3 && hasContactInfo) {
    score += 15;
    strengths.push('ATS-friendly format ve yapı');
  } else {
    score += 5;
    if (!hasBullets) issues.push('Bullet point kullan (•, -, *)');
    if (hasSections < 3) issues.push('Add Experience, Education, Skills sections');
    if (!hasContactInfo) issues.push('Add contact info and LinkedIn URL');
  }

  // 2. Kelime Sayısı (10 puan)
  const wordCount = cvText.split(/\s+/).length;
  if (wordCount >= 400 && wordCount <= 800) {
    score += 10;
    strengths.push(`Optimal length (${wordCount} words)`);
  } else if (wordCount >= 300 && wordCount < 400) {
    score += 6;
    recommendations.push('Add 300-400 more words');
  } else if (wordCount < 300) {
    score += 2;
    issues.push(`Too short (${wordCount} words) - aim for 400+ words`);
  } else {
    score += 5;
    issues.push(`Too long (${wordCount} words) - trim to 800 words`);
  }

  // 3. Sayısal Metrikler (20 puan) - ATS'nin en önemsediği
  const metrics = cvText.match(/\d+%|\$\d+[KMB]?|\d+\+|\d+x|\d+\/\d+/g) || [];
  const metricCount = metrics.length;
  
  if (metricCount >= 8) {
    score += 20;
    strengths.push(`Güçlü metrik kullanımı (${metricCount} adet)`);
  } else if (metricCount >= 4) {
    score += 12;
    recommendations.push(`Add ${8 - metricCount} more metrics (%, $, x)`);
  } else if (metricCount < 4) {
    score += 2;
    issues.push(`Too few metrics (${metricCount}) - add numbers to achievements`);
  }

  // 4. Action Verbs (15 puan)
  const actionCount = cvKeywords.actionVerbs.length;
  if (actionCount >= 10) {
    score += 15;
    strengths.push(`Güçlü action verb kullanımı (${actionCount})`);
  } else if (actionCount >= 5) {
    score += 9;
    recommendations.push('Add more action verbs (Led, Managed, Developed)');
  } else {
    score += 3;
    issues.push(`Zayıf action verb (${actionCount}) - Led, Managed, Achieved kullan`);
  }

  // 5. Teknik Skills (20 puan)
  const techCount = cvKeywords.technical.length;
  if (techCount >= 12) {
    score += 20;
    strengths.push(`Zengin teknik skill (${techCount})`);
  } else if (techCount >= 6) {
    score += 12;
    recommendations.push(`Add ${12 - techCount} more technical skills`);
  }
  
  // Soft skills (20%)
  const softWords = ['leadership', 'communication', 'teamwork', 'problem-solving', 'analytical', 'creative', 'collaborative', 'strategic', 'initiative', 'adaptability', 'time management', 'critical thinking'];
  const softCount = softWords.filter(w => cv.includes(w)).length;
  score += Math.min(softCount * 2, 10);
  if (softCount < 3) {
    recommendations.push('Add more soft skills');
  }
  if (softCount === 0) {
    issues.push('Add leadership, teamwork, communication skills');
  }

  // 7. Red Flags - Zayıf İfadeler (-15 puan)
  const redFlagCount = cvKeywords.redFlags.length;
  if (redFlagCount > 0) {
    score -= redFlagCount * 5;
    issues.push(`${redFlagCount} zayıf ifade: "${cvKeywords.redFlags.join('", "')}" - action verb'le değiştir`);
  } else {
    strengths.push('Zayıf ifade yok');
  }

  // 8. JD Keyword Match (20 puan) - En kritik
  let keywordMatch = null;
  if (jdText) {
    keywordMatch = calculateKeywordMatch(cvText, jdText);
    const kwScore = (typeof keywordMatch.score === 'number' && !isNaN(keywordMatch.score)) ? keywordMatch.score : 0;
    const matchScore = Math.round(kwScore * 0.2);
    score += matchScore;
    
    if (kwScore >= 80) {
      strengths.push(`Strong JD match (${kwScore}%)`);
    } else if (kwScore >= 60) {
      recommendations.push(`JD match ${kwScore}% - add: ${(keywordMatch.criticalMissing || []).slice(0, 3).join(', ')}`);
    } else if (kwScore >= 40) {
      issues.push(`Low JD match (${kwScore}%) - missing: ${(keywordMatch.criticalMissing || []).slice(0, 5).join(', ')}`);
    } else {
      issues.push(`Very low JD match (${kwScore}%) - critical keywords: ${(keywordMatch.criticalMissing || []).join(', ')}`);
    }

    // Keyword density uyarısı
    if (keywordMatch.density) {
      const overused = keywordMatch.density.density.filter(d => d.cvCount > d.jdCount * 2);
      if (overused.length > 0) {
        recommendations.push('Bazı keyword\'ler çok tekrarlı - doğal yaz');
      }
    }
  }

  // 9. ATS Parsing Uyumluluğu (10 puan)
  const hasStandardSections = ['experience', 'education', 'skills'].every(s => cv.includes(s));
  const hasNoTables = !cv.includes('|') && !cv.includes('┌');
  const hasNoImages = !cv.includes('image') && !cv.includes('photo');
  
  if (hasStandardSections && hasNoTables && hasNoImages) {
    score += 10;
    strengths.push('ATS parsing uyumlu');
  } else {
    score += 3;
    if (!hasStandardSections) issues.push('Standart section başlıkları kullan');
    if (!hasNoTables) recommendations.push('Tablo yerine bullet point kullan');
  }

  // Skor sınırla
  score = Math.max(0, Math.min(100, score));

  // Grade hesapla
  let grade = 'F';
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 50) grade = 'D';

  return {
    score,
    grade,
    issues,
    strengths,
    recommendations,
    industry,
    wordCount,
    metrics: metricCount,
    actionVerbs: actionCount,
    techSkills: techCount,
    softSkills: softCount,
    redFlags: redFlagCount,
    keywords: cvKeywords,
    keywordMatch
  };
}

// CV iyileştirme önerileri
export function generateImprovements(cvText, jdText, analysis) {
  const improvements = [];

  // Red flag'leri düzelt
  if (analysis.redFlags > 0) {
    improvements.push({
      priority: 'HIGH',
      category: 'Action Verbs',
      issue: `${analysis.redFlags} zayıf ifade tespit edildi`,
      fix: 'Zayıf ifadeleri güçlü action verb\'lerle değiştir',
      examples: analysis.keywords.redFlags.map(rf => `"${rf}" → "Led/Managed/Developed"`)
    });
  }

  // Metrik eksikliği
  if (analysis.metrics < 5) {
    improvements.push({
      priority: 'HIGH',
      category: 'Quantifiable Results',
      issue: `Sadece ${analysis.metrics} metrik var`,
      fix: 'Her başarıya sayı ekle',
      examples: ['%increase (e.g., +35% revenue)', '$value (e.g., $2.4M budget)', 'Team size (e.g., 12-person team)', 'Duration (e.g., 3 weeks early)']
    });
  }

  // JD keyword match düşükse
  if (analysis.keywordMatch && analysis.keywordMatch.score < 70) {
    improvements.push({
      priority: 'CRITICAL',
      category: 'JD Keyword Match',
      issue: `Only ${analysis.keywordMatch.score}% match with JD`,
      fix: 'Add these critical keywords',
      examples: analysis.keywordMatch.criticalMissing.slice(0, 8)
    });
  }

  // Action verb eksikliği
  if (analysis.actionVerbs < 8) {
    improvements.push({
      priority: 'MEDIUM',
      category: 'Action Verbs',
      issue: `Only ${analysis.actionVerbs} action verbs`,
      fix: 'Start each bullet with a strong verb',
      examples: ['Led', 'Managed', 'Developed', 'Implemented', 'Achieved', 'Optimized']
    });
  }

  // Teknik skill eksikliği
  if (analysis.techSkills < 8) {
    improvements.push({
      priority: 'MEDIUM',
      category: 'Technical Skills',
      issue: `Only ${analysis.techSkills} technical skills`,
      fix: 'Add all technologies you use',
      examples: ['Programming languages', 'Frameworks', 'Databases', 'Cloud platforms']
    });
  }

  return improvements;
}

// ATS geçiş tahmini
export function predictATSPass(analysis) {
  const { score, keywordMatch } = analysis;
  
  let passRate = 0;
  let verdict = '';
  let color = '';

  if (score >= 85 && (!keywordMatch || keywordMatch.score >= 70)) {
    passRate = 92;
    verdict = 'Çok Yüksek - ATS\'den geçme ihtimali çok yüksek';
    color = 'green';
  } else if (score >= 70 && (!keywordMatch || keywordMatch.score >= 50)) {
    passRate = 75;
    verdict = 'Yüksek - ATS\'den geçebilir ama iyileştirilebilir';
    color = 'lime';
  } else if (score >= 55) {
    passRate = 45;
    verdict = 'Orta - ATS\'den geçme şansı düşük';
    color = 'amber';
  } else {
    passRate = 15;
    verdict = 'Düşük - ATS tarafından büyük ihtimalle reddedilir';
    color = 'rose';
  }

  return { passRate, verdict, color };
}
