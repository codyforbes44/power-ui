/* ============================================================
   CLAUDE POWER UI v2 — Model Registry
   Providers: Anthropic, OpenAI, Google, Groq, + Image Gen
   ============================================================ */

export const MODELS_DATA = {

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
    mistral: {
      id: 'mistral',
      name: 'Mistral',
      icon: 'ⱡ',
      color: '#ff7000',
      baseUrl: 'https://api.mistral.ai',
      keyPlaceholder: '…',
      docsUrl: 'https://console.mistral.ai/api-keys',
    },
    'image-gen': {
      id: 'image-gen',
      name: 'Image Generation',
      icon: '🎨',
      color: '#ec4899',
      baseUrl: '',
      keyPlaceholder: 'Provider key (BFL / fal / Replicate)…',
      docsUrl: 'https://docs.bfl.ml',
      isImageProvider: true,   // flag: clicking selects image mode, not chat
    },
  },

  models: [
    // ── Anthropic ──────────────────────────────────────────
    {
      id: 'claude-3-7-sonnet-20250219',
      provider: 'anthropic',
      name: 'Claude 3.7 Sonnet',
      shortName: '3.7 Sonnet',
      tier: 'flagship',
      contextK: 200,
      inputPer1M: 3.00,
      outputPer1M: 15.00,
      cacheWritePer1M: 3.75,
      cacheReadPer1M: 0.30,
      supportsThinking: true,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      name: 'Claude 3.5 Sonnet',
      shortName: '3.5 Sonnet',
      tier: 'flagship',
      contextK: 200,
      inputPer1M: 3.00,
      outputPer1M: 15.00,
      cacheWritePer1M: 3.75,
      cacheReadPer1M: 0.30,
      supportsThinking: true,
    },
    {
      id: 'claude-3-5-haiku-20241022',
      provider: 'anthropic',
      name: 'Claude 3.5 Haiku',
      shortName: '3.5 Haiku',
      tier: 'balanced',
      contextK: 200,
      inputPer1M: 0.80,
      outputPer1M: 4.00,
      cacheWritePer1M: 1.00,
      cacheReadPer1M: 0.08,
      supportsThinking: false,
    },
    {
      id: 'claude-3-opus-20240229',
      provider: 'anthropic',
      name: 'Claude 3 Opus',
      shortName: '3 Opus',
      tier: 'reasoning',
      contextK: 200,
      inputPer1M: 15.00,
      outputPer1M: 75.00,
      cacheWritePer1M: 18.75,
      cacheReadPer1M: 1.50,
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
      tier: 'balanced',
      contextK: 128,
      inputPer1M: 0.15,
      outputPer1M: 0.60,
      supportsThinking: false,
    },
    {
      id: 'o3-mini',
      provider: 'openai',
      name: 'o3-mini',
      shortName: 'o3-mini',
      tier: 'reasoning',
      contextK: 200,
      inputPer1M: 1.10,
      outputPer1M: 4.40,
      supportsThinking: true,
    },

    // ── Google ─────────────────────────────────────────────
    {
      id: 'gemini-2.5-flash',
      provider: 'google',
      name: 'Gemini 2.5 Flash',
      shortName: '2.5 Flash',
      tier: 'flagship',
      contextK: 1000,
      inputPer1M: 0.15,
      outputPer1M: 0.60,
      supportsThinking: false,
    },
    {
      id: 'gemini-2.0-flash',
      provider: 'google',
      name: 'Gemini 2.0 Flash',
      shortName: '2.0 Flash',
      tier: 'fast',
      contextK: 1000,
      inputPer1M: 0.10,
      outputPer1M: 0.40,
      supportsThinking: false,
    },
    {
      id: 'gemini-1.5-pro',
      provider: 'google',
      name: 'Gemini 1.5 Pro',
      shortName: '1.5 Pro',
      tier: 'flagship',
      contextK: 2000,
      inputPer1M: 1.25,
      outputPer1M: 10.00,
      supportsThinking: true,
    },
    {
      id: 'gemini-1.5-flash',
      provider: 'google',
      name: 'Gemini 1.5 Flash',
      shortName: '1.5 Flash',
      tier: 'fast',
      contextK: 1000,
      inputPer1M: 0.075,
      outputPer1M: 0.30,
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
      id: 'qwen3-32b',
      provider: 'groq',
      name: 'Qwen3 32B',
      shortName: 'Qwen3 32B',
      tier: 'balanced',
      contextK: 32,
      inputPer1M: 0.27,
      outputPer1M: 0.27,
      supportsThinking: false,
    },

    // ── Mistral ────────────────────────────────────────────
    {
      id: 'mistral-large-3',
      provider: 'mistral',
      name: 'Mistral Large 3',
      shortName: 'Mistral Large 3',
      tier: 'flagship',
      contextK: 128,
      inputPer1M: 2.00,
      outputPer1M: 6.00,
      supportsThinking: false,
    },
    {
      id: 'mistral-medium-3.5',
      provider: 'mistral',
      name: 'Mistral Medium 3.5',
      shortName: 'Mistral Medium 3.5',
      tier: 'balanced',
      contextK: 128,
      inputPer1M: 1.00,
      outputPer1M: 3.00,
      supportsThinking: false,
    },
    {
      id: 'mistral-small-4',
      provider: 'mistral',
      name: 'Mistral Small 4',
      shortName: 'Mistral Small 4',
      tier: 'fast',
      contextK: 128,
      inputPer1M: 0.20,
      outputPer1M: 0.60,
      supportsThinking: false,
    },

    // ── Image Generation (ComfyUI + Flux via BFL / fal / Replicate) ─
    // These entries appear in the model dropdown under the 🎨 heading.
    // Selecting one routes the session into image-gen mode:
    //   • Chat messages become /imagine prompts automatically
    //   • ImageRouter.generate() is called with imageProvider + imageModel
    // Token costs are 0 (billing is per-image at the provider).
    {
      id: 'comfyui-local',
      provider: 'image-gen',
      imageProvider: 'comfyui',
      imageModel: 'default',
      name: 'ComfyUI (Local)',
      shortName: 'ComfyUI Local',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Your local ComfyUI instance at 127.0.0.1:8188. No API key needed.',
      badge: 'LOCAL',
    },
    {
      id: 'flux-pro-1.1-bfl',
      provider: 'image-gen',
      imageProvider: 'bfl',
      imageModel: 'flux-pro-1.1',
      name: 'Flux Pro 1.1 (BFL)',
      shortName: 'Flux Pro 1.1',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Black Forest Labs Flux Pro 1.1 — photorealistic, high detail.',
      badge: 'BFL',
    },
    {
      id: 'flux-dev-bfl',
      provider: 'image-gen',
      imageProvider: 'bfl',
      imageModel: 'flux-dev',
      name: 'Flux Dev (BFL)',
      shortName: 'Flux Dev',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Black Forest Labs Flux Dev — fast, creative, open-weights.',
      badge: 'BFL',
    },
    {
      id: 'flux-schnell-bfl',
      provider: 'image-gen',
      imageProvider: 'bfl',
      imageModel: 'flux-schnell',
      name: 'Flux Schnell (BFL)',
      shortName: 'Flux Schnell',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Black Forest Labs Flux Schnell — ultra-fast, 4-step generation.',
      badge: 'BFL',
    },
    {
      id: 'flux-pro-fal',
      provider: 'image-gen',
      imageProvider: 'fal',
      imageModel: 'fal-ai/flux-pro',
      name: 'Flux Pro (fal.ai)',
      shortName: 'Flux Pro (fal)',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Flux Pro routed through fal.ai — good alternative if BFL is unavailable.',
      badge: 'fal',
    },
    {
      id: 'flux-dev-fal',
      provider: 'image-gen',
      imageProvider: 'fal',
      imageModel: 'fal-ai/flux/dev',
      name: 'Flux Dev (fal.ai)',
      shortName: 'Flux Dev (fal)',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Flux Dev via fal.ai — open-weights, creative.',
      badge: 'fal',
    },
    {
      id: 'flux-replicate',
      provider: 'image-gen',
      imageProvider: 'replicate',
      imageModel: 'black-forest-labs/flux-1.1-pro',
      name: 'Flux 1.1 Pro (Replicate)',
      shortName: 'Flux (Replicate)',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Flux 1.1 Pro via Replicate — pay-per-run, no subscription.',
      badge: 'Replicate',
    },
    {
      id: 'flux-1.1-pro-ultra-replicate',
      provider: 'image-gen',
      imageProvider: 'replicate',
      imageModel: 'black-forest-labs/flux-1.1-pro-ultra',
      name: 'Flux 1.1 Pro Ultra (Replicate)',
      shortName: 'Flux Ultra (Replicate)',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Flux 1.1 Pro Ultra via Replicate.',
      badge: 'Replicate',
    },
    {
      id: 'flux-dev-lora-replicate',
      provider: 'image-gen',
      imageProvider: 'replicate',
      imageModel: 'lucataco/flux-dev-lora',
      name: 'Flux Dev LoRA (Replicate)',
      shortName: 'Flux LoRA (Replicate)',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Flux Dev LoRA via Replicate fine-tunes.',
      badge: 'Replicate',
    },
    {
      id: 'kling-2.5-fal',
      provider: 'image-gen',
      imageProvider: 'fal',
      imageModel: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
      name: 'Kling v2.5 Turbo (fal.ai)',
      shortName: 'Kling 2.5 (fal)',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Kling v2.5 Turbo Text-to-Video via fal.ai.',
      badge: 'fal',
    },
    {
      id: 'kling-2.5-novita',
      provider: 'image-gen',
      imageProvider: 'novita',
      imageModel: 'kling-2.5-turbo-t2v',
      name: 'Kling v2.5 Turbo (Novita)',
      shortName: 'Kling 2.5 (Novita)',
      tier: 'image',
      contextK: 0,
      inputPer1M: 0,
      outputPer1M: 0,
      supportsThinking: false,
      toolCalling: false,
      desc: 'Kling v2.5 Turbo Text-to-Video via Novita AI.',
      badge: 'Novita',
    },
  ],

  // ── Helpers ────────────────────────────────────────────────

  getModel(id) {
    if (!id) return null;
    const found = this.models.find(m => m.id === id);
    if (found) return found;
    // Dynamic provider resolution for unlisted or custom model IDs
    if (id.startsWith('gemini-')) return { id, provider: 'google', name: id, shortName: id, tier: 'flagship', contextK: 1000, inputPer1M: 1.25, outputPer1M: 5.0, supportsThinking: false };
    if (id.startsWith('claude-')) return { id, provider: 'anthropic', name: id, shortName: id, tier: 'flagship', contextK: 200, inputPer1M: 3.0, outputPer1M: 15.0, supportsThinking: false };
    if (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3')) return { id, provider: 'openai', name: id, shortName: id, tier: 'flagship', contextK: 128, inputPer1M: 2.5, outputPer1M: 10.0, supportsThinking: false };
    if (id.startsWith('mistral-') || id.startsWith('pixtral-')) return { id, provider: 'mistral', name: id, shortName: id, tier: 'flagship', contextK: 128, inputPer1M: 2.0, outputPer1M: 6.0, supportsThinking: false };
    if (id.startsWith('llama-') || id.startsWith('gemma-') || id.startsWith('mixtral-')) return { id, provider: 'groq', name: id, shortName: id, tier: 'fast', contextK: 128, inputPer1M: 0.5, outputPer1M: 0.8, supportsThinking: false };
    return null;
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
    flagship: { label: 'Flagship',  color: '#6366f1' },
    balanced:  { label: 'Balanced',  color: '#06b6d4' },
    fast:      { label: 'Fast',      color: '#10b981' },
    fastest:   { label: 'Fastest',   color: '#84cc16' },
    reasoning: { label: 'Reasoning', color: '#f59e0b' },
    image:     { label: 'Image Gen', color: '#ec4899' },
  },
};
window.MODELS_DATA = MODELS_DATA;
