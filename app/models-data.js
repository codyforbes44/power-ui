/* ============================================================
   CLAUDE POWER UI v2 — Model Registry
   Providers: Anthropic, OpenAI, Google, Groq
   ============================================================ */

const MODELS_DATA = {

  providers: {
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic',
      icon: '✦',
      color: '#c47c5a',
      baseUrl: 'https://api.anthropic.com',
      keyPlaceholder: 'sk-ant-api03-…',
      docsUrl: 'https://console.anthropic.com/settings/keys',
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      icon: '◎',
      color: '#10a37f',
      baseUrl: 'https://api.openai.com',
      keyPlaceholder: 'sk-proj-…',
      docsUrl: 'https://platform.openai.com/api-keys',
    },
    google: {
      id: 'google',
      name: 'Google',
      icon: '⬡',
      color: '#4285f4',
      baseUrl: 'https://generativelanguage.googleapis.com',
      keyPlaceholder: 'AIza…',
      docsUrl: 'https://aistudio.google.com/app/apikey',
    },
    groq: {
      id: 'groq',
      name: 'Groq',
      icon: '⚡',
      color: '#f55036',
      baseUrl: 'https://api.groq.com',
      keyPlaceholder: 'gsk_…',
      docsUrl: 'https://console.groq.com/keys',
    },
  },

  models: [
    // ── Anthropic ──────────────────────────────────────────
    {
      id: 'claude-opus-4-5',
      provider: 'anthropic',
      name: 'Claude Opus 4.5',
      shortName: 'Opus 4.5',
      tier: 'flagship',
      contextK: 200,
      inputPer1M: 15.00,
      outputPer1M: 75.00,
      cacheWritePer1M: 18.75,
      cacheReadPer1M: 1.50,
      supportsThinking: true,
    },
    {
      id: 'claude-sonnet-4-5',
      provider: 'anthropic',
      name: 'Claude Sonnet 4.5',
      shortName: 'Sonnet 4.5',
      tier: 'balanced',
      contextK: 200,
      inputPer1M: 3.00,
      outputPer1M: 15.00,
      cacheWritePer1M: 3.75,
      cacheReadPer1M: 0.30,
      supportsThinking: true,
    },
    {
      id: 'claude-haiku-3-5',
      provider: 'anthropic',
      name: 'Claude Haiku 3.5',
      shortName: 'Haiku 3.5',
      tier: 'fast',
      contextK: 200,
      inputPer1M: 0.80,
      outputPer1M: 4.00,
      cacheWritePer1M: 1.00,
      cacheReadPer1M: 0.08,
      supportsThinking: false,
    },

    // ── OpenAI ─────────────────────────────────────────────
    {
      id: 'gpt-4o',
      provider: 'openai',
      name: 'GPT-4o',
      shortName: 'GPT-4o',
      tier: 'flagship',
      contextK: 128,
      inputPer1M: 2.50,
      outputPer1M: 10.00,
      supportsThinking: false,
    },
    {
      id: 'gpt-4o-mini',
      provider: 'openai',
      name: 'GPT-4o Mini',
      shortName: '4o Mini',
      tier: 'fast',
      contextK: 128,
      inputPer1M: 0.15,
      outputPer1M: 0.60,
      supportsThinking: false,
    },
    {
      id: 'o3',
      provider: 'openai',
      name: 'o3',
      shortName: 'o3',
      tier: 'reasoning',
      contextK: 200,
      inputPer1M: 10.00,
      outputPer1M: 40.00,
      supportsThinking: true,
    },
    {
      id: 'o4-mini',
      provider: 'openai',
      name: 'o4-mini',
      shortName: 'o4-mini',
      tier: 'reasoning',
      contextK: 200,
      inputPer1M: 1.10,
      outputPer1M: 4.40,
      supportsThinking: true,
    },

    // ── Google ─────────────────────────────────────────────
    {
      id: 'gemini-2.5-pro',
      provider: 'google',
      name: 'Gemini 2.5 Pro',
      shortName: 'Gemini Pro',
      tier: 'flagship',
      contextK: 1048,
      inputPer1M: 1.25,
      outputPer1M: 10.00,
      supportsThinking: true,
    },
    {
      id: 'gemini-2.5-flash',
      provider: 'google',
      name: 'Gemini 2.5 Flash',
      shortName: 'Gemini Flash',
      tier: 'fast',
      contextK: 1048,
      inputPer1M: 0.15,
      outputPer1M: 0.60,
      supportsThinking: false,
    },
    {
      id: 'gemini-2.0-flash',
      provider: 'google',
      name: 'Gemini 2.0 Flash',
      shortName: 'Gemini 2.0',
      tier: 'fast',
      contextK: 1048,
      inputPer1M: 0.10,
      outputPer1M: 0.40,
      supportsThinking: false,
    },

    // ── Groq ───────────────────────────────────────────────
    {
      id: 'llama-3.3-70b-versatile',
      provider: 'groq',
      name: 'Llama 3.3 70B',
      shortName: 'Llama 70B',
      tier: 'fast',
      contextK: 128,
      inputPer1M: 0.59,
      outputPer1M: 0.79,
      supportsThinking: false,
    },
    {
      id: 'llama-3.1-8b-instant',
      provider: 'groq',
      name: 'Llama 3.1 8B',
      shortName: 'Llama 8B',
      tier: 'fastest',
      contextK: 128,
      inputPer1M: 0.05,
      outputPer1M: 0.08,
      supportsThinking: false,
    },
    {
      id: 'mixtral-8x7b-32768',
      provider: 'groq',
      name: 'Mixtral 8x7B',
      shortName: 'Mixtral',
      tier: 'balanced',
      contextK: 32,
      inputPer1M: 0.27,
      outputPer1M: 0.27,
      supportsThinking: false,
    },
  ],

  // ── Helpers ────────────────────────────────────────────────

  getModel(id) {
    return this.models.find(m => m.id === id) || null;
  },

  getProvider(id) {
    return this.providers[id] || null;
  },

  getModelsByProvider(providerId) {
    return this.models.filter(m => m.provider === providerId);
  },

  /**
   * Calculate cost from token usage.
   * @returns { inputCost, outputCost, totalCost, totalFormatted }
   */
  calculateCost(modelId, inputTokens = 0, outputTokens = 0, cacheReadTokens = 0) {
    const model = this.getModel(modelId);
    if (!model) return { inputCost: 0, outputCost: 0, totalCost: 0, totalFormatted: '—' };

    const inputCost  = (inputTokens  / 1_000_000) * model.inputPer1M;
    const outputCost = (outputTokens / 1_000_000) * model.outputPer1M;
    const cacheCost  = model.cacheReadPer1M
      ? (cacheReadTokens / 1_000_000) * model.cacheReadPer1M
      : 0;
    const totalCost  = inputCost + outputCost + cacheCost;

    return {
      inputCost,
      outputCost,
      cacheCost,
      totalCost,
      totalFormatted: totalCost < 0.001
        ? `$${(totalCost * 1000).toFixed(3)}m`   // show in milli-dollars
        : `$${totalCost.toFixed(4)}`,
    };
  },

  /**
   * Tier display helpers
   */
  tierLabel: {
    flagship: { label: 'Flagship', color: '#6366f1' },
    balanced:  { label: 'Balanced', color: '#06b6d4' },
    fast:      { label: 'Fast',     color: '#10b981' },
    fastest:   { label: 'Fastest',  color: '#84cc16' },
    reasoning: { label: 'Reasoning','color': '#f59e0b' },
  },
};
