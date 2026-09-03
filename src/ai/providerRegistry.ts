// ============================================================
// POINTAGE — LLM Provider Registry (Swappable Architecture)
// ============================================================

import type { LLMProvider } from './types';
import { geminiProvider } from './geminiProvider';

const API_KEY_PREFIX = 'pointage_api_key_';
const MODEL_PREFIX = 'pointage_model_';
const ACTIVE_PROVIDER_KEY = 'pointage_active_llm_provider';

const inMemoryStore = new Map<string, string>();

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // Fallback on restricted storage
  }
  return inMemoryStore.get(key) ?? null;
}

function safeSet(key: string, value: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // Fallback on restricted storage
  }
  inMemoryStore.set(key, value);
}

class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  constructor() {
    this.register(geminiProvider);
  }

  register(provider: LLMProvider) {
    this.providers.set(provider.id, provider);
  }

  get(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  getActiveProvider(): LLMProvider {
    const savedId = safeGet(ACTIVE_PROVIDER_KEY);
    if (savedId && this.providers.has(savedId)) {
      return this.providers.get(savedId)!;
    }
    return geminiProvider;
  }

  setActiveProvider(id: string) {
    if (this.providers.has(id)) {
      safeSet(ACTIVE_PROVIDER_KEY, id);
    }
  }

  getApiKey(providerId: string): string {
    return safeGet(`${API_KEY_PREFIX}${providerId}`) || '';
  }

  setApiKey(providerId: string, key: string) {
    safeSet(`${API_KEY_PREFIX}${providerId}`, key.trim());
  }

  getSelectedModel(providerId: string): string {
    const provider = this.get(providerId);
    const saved = safeGet(`${MODEL_PREFIX}${providerId}`);
    if (saved) return saved;
    const defaultModel = provider?.models.find((m) => m.recommended)?.id || provider?.models[0]?.id;
    return defaultModel || 'gemini-2.5-flash-lite';
  }

  setSelectedModel(providerId: string, modelId: string) {
    safeSet(`${MODEL_PREFIX}${providerId}`, modelId);
  }

  clear() {
    inMemoryStore.clear();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
    } catch {}
  }
}

export const providerRegistry = new ProviderRegistry();
