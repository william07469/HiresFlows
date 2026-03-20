// Sektörlere özel ATS keyword database

export const ATS_KEYWORDS = {
  // Yazılım Geliştirme
  software: {
    languages: ['javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'php', 'ruby', 'swift', 'kotlin', 'scala'],
    frameworks: ['react', 'angular', 'vue', 'next.js', 'node.js', 'express', 'django', 'flask', 'spring', 'laravel', '.net', 'asp.net'],
    databases: ['sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb', 'cassandra', 'oracle'],
    cloud: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'ci/cd', 'devops', 'microservices'],
    tools: ['git', 'github', 'gitlab', 'jira', 'confluence', 'slack', 'agile', 'scrum', 'kanban', 'rest api', 'graphql'],
    concepts: ['oop', 'solid', 'design patterns', 'tdd', 'unit testing', 'integration testing', 'performance optimization', 'scalability']
  },

  // Veri Bilimi & AI
  datascience: {
    languages: ['python', 'r', 'sql', 'scala', 'julia'],
    frameworks: ['tensorflow', 'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy', 'matplotlib', 'seaborn'],
    ml: ['machine learning', 'deep learning', 'nlp', 'computer vision', 'neural networks', 'random forest', 'xgboost', 'lstm', 'transformer'],
    tools: ['jupyter', 'tableau', 'power bi', 'spark', 'hadoop', 'airflow', 'mlflow', 'kubeflow'],
    concepts: ['statistical analysis', 'data modeling', 'feature engineering', 'model deployment', 'a/b testing', 'predictive analytics']
  },

  // Ürün Yönetimi
  product: {
    skills: ['product strategy', 'roadmap', 'user research', 'market analysis', 'competitive analysis', 'stakeholder management'],
    tools: ['jira', 'confluence', 'figma', 'miro', 'productboard', 'mixpanel', 'amplitude', 'google analytics'],
    methodologies: ['agile', 'scrum', 'lean', 'design thinking', 'jobs to be done', 'okr', 'kpi'],
    metrics: ['user engagement', 'retention', 'churn', 'conversion rate', 'nps', 'csat', 'dau', 'mau', 'arpu']
  },

  // Pazarlama
  marketing: {
    digital: ['seo', 'sem', 'ppc', 'google ads', 'facebook ads', 'content marketing', 'email marketing', 'social media'],
    analytics: ['google analytics', 'google tag manager', 'mixpanel', 'segment', 'a/b testing', 'conversion optimization'],
    tools: ['hubspot', 'salesforce', 'mailchimp', 'hootsuite', 'buffer', 'canva', 'adobe creative suite'],
    metrics: ['roi', 'cac', 'ltv', 'ctr', 'cpc', 'cpm', 'conversion rate', 'engagement rate']
  },

  // Finans
  finance: {
    skills: ['financial modeling', 'valuation', 'budgeting', 'forecasting', 'financial analysis', 'risk management'],
    tools: ['excel', 'bloomberg', 'quickbooks', 'sap', 'oracle financials', 'tableau', 'power bi'],
    concepts: ['gaap', 'ifrs', 'dcf', 'npv', 'irr', 'wacc', 'ebitda', 'p&l', 'balance sheet', 'cash flow'],
    certifications: ['cpa', 'cfa', 'cma', 'frm']
  },

  // Ortak Action Verbs (tüm sektörler)
  actionVerbs: {
    leadership: ['led', 'managed', 'directed', 'supervised', 'coordinated', 'mentored', 'coached', 'guided'],
    achievement: ['achieved', 'delivered', 'exceeded', 'surpassed', 'accomplished', 'attained', 'reached'],
    creation: ['developed', 'created', 'designed', 'built', 'established', 'launched', 'implemented', 'initiated'],
    improvement: ['improved', 'optimized', 'enhanced', 'streamlined', 'increased', 'reduced', 'accelerated', 'transformed'],
    analysis: ['analyzed', 'evaluated', 'assessed', 'researched', 'investigated', 'identified', 'diagnosed']
  },

  // Soft Skills
  softSkills: [
    'leadership', 'communication', 'teamwork', 'collaboration', 'problem solving',
    'critical thinking', 'analytical', 'strategic thinking', 'decision making',
    'project management', 'time management', 'adaptability', 'creativity', 'innovation',
    'attention to detail', 'organizational', 'interpersonal', 'presentation', 'negotiation'
  ],

  // ATS Red Flags (kaçınılması gerekenler)
  redFlags: [
    'responsible for', 'worked on', 'helped with', 'assisted', 'involved in',
    'participated in', 'contributed to', 'duties included', 'tasks included'
  ]
};

// Sektör tespiti
export function detectIndustry(text) {
  const lower = text.toLowerCase();
  const scores = {};

  for (const [industry, categories] of Object.entries(ATS_KEYWORDS)) {
    if (industry === 'actionVerbs' || industry === 'softSkills' || industry === 'redFlags') continue;
    
    let score = 0;
    for (const keywords of Object.values(categories)) {
      if (Array.isArray(keywords)) {
        score += keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
      }
    }
    scores[industry] = score;
  }

  const topIndustry = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return topIndustry ? topIndustry[0] : 'software';
}

// Gelişmiş keyword extraction
export function extractATSKeywords(text, industry = null) {
  const lower = text.toLowerCase();
  const detected = industry || detectIndustry(text);
  const found = {
    industry: detected,
    technical: [],
    tools: [],
    actionVerbs: [],
    softSkills: [],
    redFlags: []
  };

  // Sektöre özel keyword'ler
  const industryData = ATS_KEYWORDS[detected] || {};
  for (const [category, keywords] of Object.entries(industryData)) {
    if (Array.isArray(keywords)) {
      const matches = keywords.filter(kw => lower.includes(kw.toLowerCase()));
      if (category === 'languages' || category === 'frameworks' || category === 'databases' || 
          category === 'cloud' || category === 'ml' || category === 'skills') {
        found.technical.push(...matches);
      } else if (category === 'tools') {
        found.tools.push(...matches);
      }
    }
  }

  // Action verbs
  for (const verbs of Object.values(ATS_KEYWORDS.actionVerbs)) {
    found.actionVerbs.push(...verbs.filter(v => lower.includes(v)));
  }

  // Soft skills
  found.softSkills = ATS_KEYWORDS.softSkills.filter(s => lower.includes(s.toLowerCase()));

  // Red flags
  found.redFlags = ATS_KEYWORDS.redFlags.filter(rf => lower.includes(rf));

  return found;
}

// Keyword density analizi
export function analyzeKeywordDensity(cvText, jdText) {
  if (!jdText) return null;

  const cvLower = cvText.toLowerCase();
  const jdLower = jdText.toLowerCase();

  // JD'den önemli keyword'leri çıkar (2+ kelime tekrarı)
  const words = jdLower.match(/\b[a-z]{3,}\b/g) || [];
  const wordFreq = {};
  
  words.forEach(w => {
    if (!['the', 'and', 'for', 'with', 'you', 'are', 'will', 'have', 'this', 'that'].includes(w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  });

  // 2+ kez geçen keyword'ler
  const importantKeywords = Object.entries(wordFreq)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  // CV'de kaç kez geçiyor
  const density = importantKeywords.map(kw => ({
    keyword: kw,
    jdCount: wordFreq[kw],
    cvCount: (cvLower.match(new RegExp('\\b' + kw + '\\b', 'g')) || []).length,
    inCV: cvLower.includes(kw)
  }));

  const matched = density.filter(d => d.inCV).length;
  const matchRate = importantKeywords.length > 0 ? Math.round((matched / importantKeywords.length) * 100) : 0;

  return {
    matchRate: isNaN(matchRate) ? 0 : matchRate,
    totalKeywords: importantKeywords.length,
    matched,
    missing: importantKeywords.length - matched,
    density,
    criticalMissing: density.filter(d => !d.inCV && d.jdCount >= 3).map(d => d.keyword)
  };
}
