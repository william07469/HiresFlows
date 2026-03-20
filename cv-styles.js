// Farklı CV yazım tarzları

export const CV_STYLES = [
  {
    name: 'Executive',
    description: 'C-level için stratejik, liderlik odaklı',
    tone: 'authoritative and strategic',
    focus: 'business impact, revenue, team leadership, strategic initiatives',
    bulletStyle: 'Start with strategic verbs: Spearheaded, Orchestrated, Championed, Transformed',
    example: 'Spearheaded digital transformation initiative, driving $4.2M revenue increase and 45% operational efficiency gain across 3 business units'
  },
  {
    name: 'Technical',
    description: 'Yazılım/mühendislik için teknik detaylı',
    tone: 'technical and precise',
    focus: 'technologies, architectures, performance metrics, technical challenges solved',
    bulletStyle: 'Start with technical verbs: Engineered, Architected, Developed, Optimized, Implemented',
    example: 'Engineered microservices architecture using Node.js and Kubernetes, reducing API latency by 67% and handling 10M+ daily requests'
  },
  {
    name: 'Results-Driven',
    description: 'Sayı ve sonuç odaklı, agresif',
    tone: 'achievement-focused and quantitative',
    focus: 'numbers, percentages, dollar amounts, time savings, growth metrics',
    bulletStyle: 'Lead with impact: Increased, Reduced, Accelerated, Delivered, Achieved',
    example: 'Increased customer retention by 52% and reduced churn by $1.8M annually through data-driven engagement strategy'
  },
  {
    name: 'Collaborative',
    description: 'Takım çalışması ve cross-functional',
    tone: 'collaborative and team-oriented',
    focus: 'cross-functional work, stakeholder management, team achievements, partnerships',
    bulletStyle: 'Emphasize collaboration: Led, Coordinated, Partnered, Facilitated, Aligned',
    example: 'Coordinated cross-functional team of 15 across Engineering, Design, and Marketing, launching MVP 4 weeks early with 98% stakeholder satisfaction'
  },
  {
    name: 'Innovation',
    description: 'Yenilikçi, problem-solving odaklı',
    tone: 'innovative and creative',
    focus: 'new solutions, process improvements, creative approaches, innovation metrics',
    bulletStyle: 'Highlight innovation: Pioneered, Innovated, Redesigned, Revolutionized, Introduced',
    example: 'Pioneered AI-powered recommendation engine, increasing user engagement by 73% and generating $2.1M additional revenue in Q1'
  }
];

// Random tarz seç
export function selectRandomStyle() {
  return CV_STYLES[Math.floor(Math.random() * CV_STYLES.length)];
}

// Tarzları döngüsel kullan
let styleIndex = 0;
export function selectNextStyle() {
  const style = CV_STYLES[styleIndex];
  styleIndex = (styleIndex + 1) % CV_STYLES.length;
  return style;
}
