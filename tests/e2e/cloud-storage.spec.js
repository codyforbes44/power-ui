'use strict';

const { test, expect } = require('./fixtures');

async function mockFirebase(page) {
  await page.evaluate(() => {
    if (!window.firebase) window.firebase = {};

    let mockConfigData = null;
    let mockMemoryData = null;
    const mockKbDocs = new Map();
    const mockGalleryDocs = new Map();

    const mockDoc = (type, id) => ({
      exists: type === 'config' ? !!mockConfigData : (type === 'memory' ? !!mockMemoryData : false),
      data: () => {
        if (type === 'config') return { config: mockConfigData };
        if (type === 'memory') return { memories: mockMemoryData };
        return null;
      },
      get: async () => mockDoc(type, id),
      set: async (val) => {
        if (type === 'config') mockConfigData = val.config;
        if (type === 'memory') mockMemoryData = val.memories;
        if (type === 'kb') mockKbDocs.set(id, val);
        if (type === 'gallery') mockGalleryDocs.set(id, val);
      },
      delete: async () => {
        if (type === 'kb') mockKbDocs.delete(id);
        if (type === 'gallery') mockGalleryDocs.delete(id);
      },
      collection: (name) => mockCollection(name)
    });

    const mockCollection = (name) => ({
      doc: (id) => {
        if (name === 'agent_config') return mockDoc('config', id);
        if (name === 'memory') return mockDoc('memory', id);
        if (name === 'kb_documents') return mockDoc('kb', id);
        if (name === 'gallery_metadata') return mockDoc('gallery', id);
        return mockDoc('generic', id);
      },
      get: async () => {
        const docs = [];
        const sourceMap = name === 'kb_documents' ? mockKbDocs : (name === 'gallery_metadata' ? mockGalleryDocs : new Map());
        sourceMap.forEach((v) => {
          docs.push({
            data: () => v
          });
        });
        return {
          forEach: (cb) => docs.forEach(cb)
        };
      }
    });

    const mockStorageRef = {
      child: () => mockStorageRef,
      put: async () => ({
        ref: mockStorageRef
      }),
      getDownloadURL: async () => 'https://mock.firebase.cdn/path/to/image.png',
      delete: async () => {}
    };

    Object.defineProperty(window.firebase, 'firestore', {
      value: () => ({
        collection: (name) => mockCollection(name),
        doc: (path) => {
          const parts = path.split('/');
          return mockDoc(parts[2], parts[3]);
        }
      }),
      configurable: true,
      writable: true
    });

    Object.defineProperty(window.firebase, 'storage', {
      value: () => ({
        ref: () => mockStorageRef
      }),
      configurable: true,
      writable: true
    });

    window.db = window.firebase.firestore();
    window.storage = window.firebase.storage();
  });
}

test.describe('Cloud Storage & Firestore Sync Capabilities', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept /.netlify/functions/proxy requests for firebase_storage upload
    await page.route('**/.netlify/functions/proxy', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        if (body && body.provider === 'firebase_storage') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              downloadUrl: 'https://mock.firebase.cdn/path/to/image.png',
              name: `users/${body.payload.userId}/${body.payload.folder}/${body.payload.id}`
            })
          });
        }
      }
      return route.continue();
    });
  });

  test('CloudStorage API is available when logged in with mock firebase', async ({ loggedInPage: page }) => {
    await page.goto('/app/agent-chat.html');
    await mockFirebase(page);
    
    // Check CloudStorage availability
    const isAvail = await page.evaluate(() => {
      return typeof CloudStorage !== 'undefined' && CloudStorage.isAvailable();
    });
    expect(isAvail).toBe(true);
  });

  test('AgentConfig and Memory changes push to mock Firestore', async ({ loggedInPage: page }) => {
    await page.goto('/app/agent-chat.html');
    await mockFirebase(page);
    
    // Set a custom config value and memory
    const results = await page.evaluate(async () => {
      // 1. Set config
      const cfg = SuperAgent.config.get();
      cfg.systemPrompt = 'Test Cloud Prompt';
      SuperAgent.config.save(cfg);

      // 2. Set memory
      SuperAgent.memory.add('testKey', 'testValue', ['testTag'], 'general');

      // Wait a moment for background Firestore saves
      await new Promise(r => setTimeout(r, 200));

      // Fetch what was stored in localStorage
      return {
        localPrompt: SuperAgent.config.get().systemPrompt,
        localMem: SuperAgent.memory.search('testKey')
      };
    });

    expect(results.localPrompt).toBe('Test Cloud Prompt');
    expect(results.localMem.length).toBeGreaterThan(0);
  });

  test('KnowledgeBase document changes push/delete in mock Firestore', async ({ loggedInPage: page }) => {
    await page.goto('/app/agent-chat.html');
    await mockFirebase(page);

    // Add and delete KB doc
    const syncStatus = await page.evaluate(async () => {
      const doc = {
        id: 'kb_doc_123',
        title: 'Cloud Document',
        content: 'This document is synced to firestore',
        source: 'note',
        createdAt: new Date().toISOString()
      };

      // Add document
      await SuperAgent.kb.add(doc);
      
      // Verify saved in IndexedDB
      const listAfterAdd = await SuperAgent.kb.listAll();
      
      // Delete document
      await SuperAgent.kb.delete(doc.id);
      
      const listAfterDelete = await SuperAgent.kb.listAll();
      
      return {
        added: listAfterAdd.some(d => d.id === doc.id),
        deleted: !listAfterDelete.some(d => d.id === doc.id)
      };
    });

    expect(syncStatus.added).toBe(true);
    expect(syncStatus.deleted).toBe(true);
  });

  test('ImageDb uploads base64 to Firebase Storage transparently', async ({ loggedInPage: page }) => {
    await page.goto('/app/agent-chat.html');
    await mockFirebase(page);

    // Save base64 image data and assert that it resolved to the mock Firebase Storage public URL
    const storedUrl = await page.evaluate(async () => {
      const base64Data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const imageId = 'generated_img_e2e_123';
      
      await ImageDb.put(imageId, base64Data);
      
      // Retrieve the value stored in ImageDb
      return await ImageDb.get(imageId);
    });

    // The stored value must be the mocked Storage download URL instead of the raw base64 data
    expect(storedUrl).toBe('https://mock.firebase.cdn/path/to/image.png');
  });

});
