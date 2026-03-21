// Temporary debug endpoint to check environment variables
app.get('/api/debug/env', (req, res) => {
  res.json({ 
    hasWebhookSecret: !!process.env.WHOP_WEBHOOK_SECRET,
    webhookSecretLength: process.env.WHOP_WEBHOOK_SECRET?.length || 0,
    nodeEnv: process.env.NODE_ENV || 'not set',
    hasWhopApiKey: !!process.env.WHOP_API_KEY,
    whopApiKeyLength: process.env.WHOP_API_KEY?.length || 0,
    hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
    geminiApiKeyLength: process.env.GEMINI_API_KEY?.length || 0
  });
});

// ═══════════════════════════════════════════════════════
// ROUTES: Job Application Tracker API
// ═══════════════════════════════════════════════════════