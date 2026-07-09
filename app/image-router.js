/**
 * image-router.js
 * Self-contained image generation router for browser apps (no build step).
 * Supports: ComfyUI (local), Black Forest Labs, fal.ai, Replicate
 */

const ImageRouter = (() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Proxy detection (same pattern as api-router.js)
  // ---------------------------------------------------------------------------
  const USE_PROXY =
    location.hostname !== 'localhost' &&
    location.hostname !== '127.0.0.1' &&
    location.protocol !== 'file:';
  const PROXY_URL = '/.netlify/functions/proxy';

  // ---------------------------------------------------------------------------
  // Built-in ComfyUI Flux dev workflow
  // ---------------------------------------------------------------------------
  const COMFY_FLUX_WORKFLOW = {
    "3": {
      "inputs": {
        "seed": 42,
        "steps": 28,
        "cfg": 1.0,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 1.0,
        "model": ["4", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["5", 0]
      },
      "class_type": "KSampler"
    },
    "4": {
      "inputs": { "ckpt_name": "flux1-dev.safetensors" },
      "class_type": "CheckpointLoaderSimple"
    },
    "5": {
      "inputs": { "width": 1024, "height": 1024, "batch_size": 1 },
      "class_type": "EmptyLatentImage"
    },
    "6": {
      "inputs": { "text": "PROMPT_HERE", "clip": ["4", 1] },
      "class_type": "CLIPTextEncode"
    },
    "7": {
      "inputs": { "text": "", "clip": ["4", 1] },
      "class_type": "CLIPTextEncode"
    },
    "8": {
      "inputs": { "samples": ["3", 0], "vae": ["4", 2] },
      "class_type": "VAEDecode"
    },
    "9": {
      "inputs": { "filename_prefix": "claude-power-ui", "images": ["8", 0] },
      "class_type": "SaveImage"
    }
  };

  // ---------------------------------------------------------------------------
  // Public constants
  // ---------------------------------------------------------------------------
  const DEFAULTS = {
    provider: 'bfl',
    model: 'flux-pro-1.1',
    width: 1024,
    height: 1024,
    steps: 28,
    seed: -1
  };

  const MODELS = {
    bfl: [
      { id: 'flux-pro-1.1', name: 'Flux Pro 1.1' },
      { id: 'flux-dev',     name: 'Flux Dev' },
      { id: 'flux-schnell', name: 'Flux Schnell' }
    ],
    fal: [
      { id: 'fal-ai/flux/dev',      name: 'Flux Dev' },
      { id: 'fal-ai/flux/schnell',  name: 'Flux Schnell' },
      { id: 'fal-ai/flux-realism',  name: 'Flux Realism' }
    ],
    replicate: [
      { id: 'black-forest-labs/flux-1.1-pro', name: 'Flux 1.1 Pro' },
      { id: 'black-forest-labs/flux-schnell', name: 'Flux Schnell' }
    ],
    comfyui: [
      { id: 'comfyui-default', name: 'ComfyUI (local)' }
    ]
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Convert a remote URL to a base64 data URL via FileReader */
  async function urlToDataUrl(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Generate a simple UUID v4 */
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /** Sleep for ms milliseconds */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * proxyFetch — sends a request through the Netlify proxy function.
   * @param {{ provider: string, path: string, apiKey: string, payload: any, method?: string }} opts
   * @returns {Promise<Response>}
   */
  async function proxyFetch({ provider, path, apiKey, payload, method = 'POST' }) {
    const resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, path, apiKey, payload, method })
    });
    return resp;
  }

  /**
   * Make a request to a cloud provider, routing through proxy when needed.
   * For GET requests payload is ignored; path must include query string if needed.
   */
  async function cloudFetch({ provider, baseUrl, path, headers, body, method = 'POST', signal }) {
    if (USE_PROXY) {
      const resp = await proxyFetch({
        provider,
        path,
        apiKey: headers['x-key'] || headers['Authorization'] || '',
        payload: body,
        method
      });
      return resp;
    }
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      signal
    };
    if (method !== 'GET' && body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    return fetch(`${baseUrl}${path}`, opts);
  }

  // ---------------------------------------------------------------------------
  // Provider: Black Forest Labs (BFL)
  // ---------------------------------------------------------------------------
  async function generateBFL({ prompt, model, width, height, steps, seed, apiKey, signal }) {
    if (!apiKey) throw new Error('API key required for bfl');

    const BFL_BASE = 'https://api.bfl.ml';
    const headers = { 'x-key': apiKey };

    // Submit generation
    const body = { prompt, width, height, steps, safety_tolerance: 6 };
    if (seed !== -1) body.seed = seed;

    const submitResp = await cloudFetch({
      provider: 'bfl',
      baseUrl: BFL_BASE,
      path: `/v1/${model}`,
      headers,
      body,
      method: 'POST',
      signal
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text().catch(() => '');
      throw new Error(`BFL error ${submitResp.status}: ${errText}`);
    }

    const { id } = await submitResp.json();
    if (!id) throw new Error('BFL error: no prediction id returned');

    // Poll for result
    const MAX_RETRIES = 60;
    const POLL_INTERVAL = 1500;

    for (let i = 0; i < MAX_RETRIES; i++) {
      if (signal && signal.aborted) throw new Error('Generation cancelled');
      await sleep(POLL_INTERVAL);

      const pollResp = await cloudFetch({
        provider: 'bfl',
        baseUrl: BFL_BASE,
        path: `/v1/get_result?id=${id}`,
        headers,
        body: undefined,
        method: 'GET',
        signal
      });

      if (!pollResp.ok) {
        const errText = await pollResp.text().catch(() => '');
        throw new Error(`BFL poll error ${pollResp.status}: ${errText}`);
      }

      const data = await pollResp.json();

      if (data.status === 'Ready') {
        const url = data.result && data.result.sample;
        if (!url) throw new Error('BFL error: no image URL in result');
        const dataUrl = await urlToDataUrl(url);
        return { url, dataUrl, seed: (data.result && data.result.seed) || seed };
      }

      if (data.status === 'Failed') {
        throw new Error(`BFL error: generation failed — ${JSON.stringify(data)}`);
      }
      // status === 'Pending' or 'Processing' — keep polling
    }

    throw new Error(`Generation timed out after ${Math.round(MAX_RETRIES * POLL_INTERVAL / 1000)}s`);
  }

  // ---------------------------------------------------------------------------
  // Provider: fal.ai
  // ---------------------------------------------------------------------------
  async function generateFal({ prompt, model, width, height, steps, seed, apiKey, signal }) {
    if (!apiKey) throw new Error('API key required for fal');

    const FAL_BASE = 'https://fal.run';
    const headers = { 'Authorization': `Key ${apiKey}` };

    const body = {
      prompt,
      image_size: { width, height },
      num_inference_steps: steps,
      num_images: 1
    };
    if (seed !== -1) body.seed = seed;

    const resp = await cloudFetch({
      provider: 'fal',
      baseUrl: FAL_BASE,
      path: `/${model}`,
      headers,
      body,
      method: 'POST',
      signal
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`fal.ai error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const url = data.images && data.images[0] && data.images[0].url;
    if (!url) throw new Error('fal.ai error: no image URL in response');

    const dataUrl = await urlToDataUrl(url);
    return { url, dataUrl, seed: data.seed !== undefined ? data.seed : seed };
  }

  // ---------------------------------------------------------------------------
  // Provider: Replicate
  // ---------------------------------------------------------------------------
  async function generateReplicate({ prompt, model, width, height, steps, seed, apiKey, signal }) {
    if (!apiKey) throw new Error('API key required for replicate');

    const REP_BASE = 'https://api.replicate.com';
    const headers = { 'Authorization': `Token ${apiKey}` };

    const body = {
      input: { prompt, width, height, num_inference_steps: steps }
    };
    if (seed !== -1) body.input.seed = seed;

    const submitResp = await cloudFetch({
      provider: 'replicate',
      baseUrl: REP_BASE,
      path: `/v1/models/${model}/predictions`,
      headers,
      body,
      method: 'POST',
      signal
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text().catch(() => '');
      throw new Error(`Replicate error ${submitResp.status}: ${errText}`);
    }

    const prediction = await submitResp.json();
    const predId = prediction.id;
    if (!predId) throw new Error('Replicate error: no prediction id returned');

    // Poll for result
    const MAX_RETRIES = 45;
    const POLL_INTERVAL = 2000;

    for (let i = 0; i < MAX_RETRIES; i++) {
      if (signal && signal.aborted) throw new Error('Generation cancelled');
      await sleep(POLL_INTERVAL);

      const pollResp = await cloudFetch({
        provider: 'replicate',
        baseUrl: REP_BASE,
        path: `/v1/predictions/${predId}`,
        headers,
        body: undefined,
        method: 'GET',
        signal
      });

      if (!pollResp.ok) {
        const errText = await pollResp.text().catch(() => '');
        throw new Error(`Replicate poll error ${pollResp.status}: ${errText}`);
      }

      const data = await pollResp.json();

      if (data.status === 'succeeded') {
        const url = Array.isArray(data.output) ? data.output[0] : data.output;
        if (!url) throw new Error('Replicate error: no image URL in result');
        const dataUrl = await urlToDataUrl(url);
        return { url, dataUrl, seed: (data.input && data.input.seed) || seed };
      }

      if (data.status === 'failed' || data.status === 'canceled') {
        throw new Error(`Replicate error: prediction ${data.status} — ${data.error || ''}`);
      }
      // status === 'starting' | 'processing' — keep polling
    }

    throw new Error(`Generation timed out after ${Math.round(MAX_RETRIES * POLL_INTERVAL / 1000)}s`);
  }

  // ---------------------------------------------------------------------------
  // Provider: ComfyUI (always direct, never proxied)
  // ---------------------------------------------------------------------------
  async function generateComfyUI({ prompt, width, height, steps, seed, comfyUrl, workflow, signal }) {
    const baseUrl = (comfyUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');

    // ComfyUI runs on the user's own machine/LAN — it can never be reached via the
    // cloud proxy, so the browser must fetch it directly. On an HTTPS page (e.g. the
    // Netlify deploy) browsers block that as mixed content; fail fast with a clear
    // message instead of a confusing network error.
    if (location.protocol === 'https:' && baseUrl.startsWith('http://')) {
      throw new Error('ComfyUI (local) requires loading this app over HTTP — browsers block HTTP requests from an HTTPS page. Use the local server (python3 app/server.py) or open app/index.html directly.');
    }

    // Deep-clone workflow (user-supplied or built-in)
    const wf = JSON.parse(JSON.stringify(workflow || COMFY_FLUX_WORKFLOW));

    // Inject parameters into workflow nodes
    if (wf['6']) wf['6'].inputs.text = prompt;
    if (wf['5']) {
      wf['5'].inputs.width = width;
      wf['5'].inputs.height = height;
    }
    if (wf['3']) {
      wf['3'].inputs.steps = steps;
      wf['3'].inputs.seed = seed === -1
        ? Math.floor(Math.random() * Math.pow(2, 32))
        : seed;
    }

    const clientId = uuid();

    // Submit prompt
    const submitResp = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: wf, client_id: clientId }),
      signal
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text().catch(() => '');
      throw new Error(`ComfyUI error ${submitResp.status}: ${errText}`);
    }

    const submitData = await submitResp.json();
    const promptId = submitData.prompt_id;
    if (!promptId) throw new Error('ComfyUI error: no prompt_id returned');

    // Poll history
    const MAX_RETRIES = 120;
    const POLL_INTERVAL = 1500;

    for (let i = 0; i < MAX_RETRIES; i++) {
      if (signal && signal.aborted) throw new Error('Generation cancelled');
      await sleep(POLL_INTERVAL);

      let histData;
      try {
        const histResp = await fetch(`${baseUrl}/history/${promptId}`, { signal });
        if (!histResp.ok) continue; // may return 404 while queued
        histData = await histResp.json();
      } catch (e) {
        continue; // network hiccup — keep trying
      }

      const entry = histData[promptId];
      if (!entry) continue;

      if (entry.status && entry.status.completed) {
        // Find the first image output
        let imageInfo = null;
        const outputs = entry.outputs || {};
        for (const nodeId of Object.keys(outputs)) {
          const nodeOut = outputs[nodeId];
          if (nodeOut.images && nodeOut.images.length > 0) {
            imageInfo = nodeOut.images[0];
            break;
          }
        }

        if (!imageInfo) {
          throw new Error('ComfyUI error: generation completed but no image found in outputs');
        }

        const { filename, subfolder, type } = imageInfo;
        const params = new URLSearchParams({ filename, type });
        if (subfolder) params.set('subfolder', subfolder);

        const viewResp = await fetch(`${baseUrl}/view?${params.toString()}`, { signal });
        if (!viewResp.ok) throw new Error(`ComfyUI error fetching image: ${viewResp.status}`);

        const blob = await viewResp.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const usedSeed = (wf['3'] && wf['3'].inputs && wf['3'].inputs.seed) || seed;
        return { url: null, dataUrl, seed: usedSeed };
      }

      // Check for error status
      if (entry.status && entry.status.status_str === 'error') {
        throw new Error('ComfyUI error: generation failed');
      }
    }

    throw new Error(`Generation timed out after ${Math.round(MAX_RETRIES * POLL_INTERVAL / 1000)}s`);
  }

  // ---------------------------------------------------------------------------
  // probeComfyUI — check if a ComfyUI server is reachable
  // ---------------------------------------------------------------------------
  async function probeComfyUI(url) {
    url = url || 'http://127.0.0.1:8188';
    try {
      const base = url.replace(/\/$/, '');
      const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(3000)
        : undefined;
      const resp = await fetch(`${base}/system_stats`, { method: 'GET', signal });
      return resp.ok;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Main generate() function
  // ---------------------------------------------------------------------------
  async function generate(prompt, options) {
    options = options || {};
    const provider = options.provider || DEFAULTS.provider;
    const model    = options.model    || DEFAULTS.model;
    const width    = options.width    || DEFAULTS.width;
    const height   = options.height   || DEFAULTS.height;
    const steps    = options.steps    || DEFAULTS.steps;
    const seed     = options.seed     !== undefined ? options.seed : DEFAULTS.seed;
    const apiKey   = options.apiKey   || '';
    const comfyUrl = options.comfyUrl || 'http://127.0.0.1:8188';
    const workflow = options.workflow  || null;
    const signal   = options.signal   || null;

    const t0 = Date.now();
    let result;

    try {
      switch (provider) {
        case 'bfl':
          result = await generateBFL({ prompt, model, width, height, steps, seed, apiKey, signal });
          break;
        case 'fal':
          result = await generateFal({ prompt, model, width, height, steps, seed, apiKey, signal });
          break;
        case 'replicate':
          result = await generateReplicate({ prompt, model, width, height, steps, seed, apiKey, signal });
          break;
        case 'comfyui':
          result = await generateComfyUI({ prompt, width, height, steps, seed, comfyUrl, workflow, signal });
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (err) {
      // Re-throw with provider context if not already present
      const msg = err.message || String(err);
      if (
        msg.indexOf(provider) === -1 &&
        msg.indexOf('cancelled') === -1 &&
        msg.indexOf('timed out') === -1 &&
        msg.indexOf('Unknown provider') === -1
      ) {
        throw new Error(`${provider} error: ${msg}`);
      }
      throw err;
    }

    return {
      dataUrl:  result.dataUrl  !== undefined ? result.dataUrl  : null,
      url:      result.url      !== undefined ? result.url      : null,
      seed:     result.seed     !== undefined ? result.seed     : seed,
      model,
      provider,
      timingMs: Date.now() - t0,
      width,
      height,
      prompt
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    generate,
    probeComfyUI,
    DEFAULTS,
    MODELS
  };
})();
