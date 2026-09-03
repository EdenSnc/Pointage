import { describe, it, expect, beforeEach, vi } from 'vitest';
import { providerRegistry } from './providerRegistry';
import { geminiProvider } from './geminiProvider';

describe('Modular LLM Provider Architecture', () => {
  beforeEach(() => {
    providerRegistry.clear();
  });

  it('registers geminiProvider by default and resolves as active provider', () => {
    const active = providerRegistry.getActiveProvider();
    expect(active.id).toBe('gemini');
    expect(active.name).toBe('Google Gemini');
    expect(active.models.length).toBeGreaterThan(0);
    expect(active.models.some((m) => m.recommended)).toBe(true);
  });

  it('saves and retrieves API key securely per provider in localStorage', () => {
    expect(providerRegistry.getApiKey('gemini')).toBe('');
    providerRegistry.setApiKey('gemini', 'test-api-key-12345');
    expect(providerRegistry.getApiKey('gemini')).toBe('test-api-key-12345');
  });

  it('saves and retrieves selected model per provider', () => {
    providerRegistry.setSelectedModel('gemini', 'gemini-1.5-flash');
    expect(providerRegistry.getSelectedModel('gemini')).toBe('gemini-1.5-flash');
  });

  it('throws a descriptive error if extracting without an API key', async () => {
    const emptyFile = new File(['fake-content'], 'bl.jpg', { type: 'image/jpeg' });
    await expect(geminiProvider.extractFromImage(emptyFile, '')).rejects.toThrow(
      'Veuillez renseigner votre clé API Google Gemini'
    );
  });

  it('extracts from mock text correctly when API returns valid structured JSON', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  bills: [
                    {
                      billNumber: 'BL-MOCK-2026',
                      client: 'ENTREPOT CENTRAL',
                      lines: [
                        {
                          no: '1',
                          designation: 'CLASSEUR CHROME',
                          quantity: 25,
                          reference: 'CC-100',
                          packagesRaw: '1CT/25',
                        },
                      ],
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as any;

    try {
      const result = await geminiProvider.extractFromText('texte brut bl', 'dummy-key');
      expect(result.providerId).toBe('gemini');
      expect(result.payload.bills.length).toBe(1);
      expect(result.payload.bills[0].billNumber).toBe('BL-MOCK-2026');
      expect(result.payload.bills[0].lines[0].quantity).toBe(25);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
