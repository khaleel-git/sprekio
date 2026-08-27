export interface SprekioTranslation {
  text: string;
  definition?: string;
  confidence?: number;
}

export interface SprekioWordResult {
  surface: string;
  normalized?: string;
  lemma: string;
  translations: SprekioTranslation[] | string[];
  partOfSpeech?: string;
  gender?: string;
  case?: string;
  confidence?: number;
  source?: "dictionary" | "ai" | "cache";
  cached?: boolean;
  contextUsed?: boolean;
  resolution?: "lexical" | "contextual" | "phrase" | "ambiguous" | "not_found";
  final?: boolean;
}

const MEMORY_CACHE = new Map<string, SprekioWordResult>();
// Lightweight surface-word -> part-of-speech cache for grammar-coloring the subtitle
// text at render time. Deliberately separate from MEMORY_CACHE, whose keys embed the
// full sentence context and aren't retrievable by plain word alone.
const POS_CACHE = new Map<string, string>();

export class VocabularyEngine {
  private static dbPromise: Promise<IDBDatabase> | null = null;
  private static abortController: AbortController | null = null;

  private static async openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("SprekioVocabularyEngine", 3);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("lexicalCache")) {
          db.createObjectStore("lexicalCache", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("contextCache")) {
          db.createObjectStore("contextCache", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  private static async getFromCache(storeName: string, id: string): Promise<any> {
    const db = await this.openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => resolve(null);
    });
  }

  private static async saveToCache(storeName: string, id: string, data: any): Promise<void> {
    const db = await this.openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      store.put({ id, data, timestamp: Date.now(), version: "v1" });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  private static getLexicalKey(surface: string) {
    return `${surface.toLowerCase()}::v1`;
  }

  private static getContextKey(surface: string, sentence: string) {
    const normalizedContext = sentence.replace(/[^a-zA-ZäöüÄÖÜß]/g, '').toLowerCase();
    return `${surface.toLowerCase()}::${normalizedContext}::v1`;
  }

  private static getPrefetchPriority(word: string): "LOW" | "NORMAL" | "HIGH" {
    if (word.length <= 1) return "LOW";
    
    const lower = word.toLowerCase();

    // Frequent words that might sometimes be important but shouldn't clog the batch API if it's full
    const low = new Set(["der", "die", "das", "ein", "eine", "ich", "du", "er", "sie", "es", "wir", "ihr", "und", "oder", "aber", "zu", "von", "mit", "in", "an", "auf", "für", "aus", "bei", "nach", "als", "wie", "ist", "sind"]);
    if (low.has(lower)) return "LOW";
    
    // Important grammatical words that change meaning
    const high = new Set(["nicht", "kein", "keine", "muss", "kann", "soll", "will", "darf", "mag"]);
    if (high.has(lower)) return "HIGH";

    return "NORMAL";
  }

  private static shouldPrefetch(): boolean {
    return true; // Prefetch everything so hovers are always instant
  }

  private static cachePartOfSpeech(result: SprekioWordResult | undefined | null): void {
    if (result?.surface && result.partOfSpeech) {
      POS_CACHE.set(result.surface.toLowerCase(), result.partOfSpeech);
    }
  }

  public static getPartOfSpeechSync(word: string): string | undefined {
    return POS_CACHE.get(word.toLowerCase());
  }

  public static async lookup(
    surface: string, 
    contextSentence: string, 
    provider: string = "nvidia",
    onIntermediate?: (result: SprekioWordResult) => void
  ): Promise<SprekioWordResult> {
    const contextKey = this.getContextKey(surface, contextSentence);
    const lexicalKey = this.getLexicalKey(surface);

    // 1. Memory Cache (Check Final)
    if (MEMORY_CACHE.has(contextKey) && MEMORY_CACHE.get(contextKey)!.final !== false) return { ...MEMORY_CACHE.get(contextKey)!, cached: true, source: "cache" };
    if (MEMORY_CACHE.has(lexicalKey) && MEMORY_CACHE.get(lexicalKey)!.final !== false) return { ...MEMORY_CACHE.get(lexicalKey)!, cached: true, source: "cache" };

    // 2. IndexedDB Context Cache (Check Final)
    const cachedContext = await this.getFromCache("contextCache", contextKey);
    if (cachedContext && cachedContext.final !== false) {
       MEMORY_CACHE.set(contextKey, cachedContext);
       return { ...cachedContext, cached: true, source: "cache" };
    }

    // 3. IndexedDB Lexical Cache (Check Final)
    const cachedLexical = await this.getFromCache("lexicalCache", lexicalKey);
    if (cachedLexical && cachedLexical.final !== false) {
       MEMORY_CACHE.set(lexicalKey, cachedLexical);
       return { ...cachedLexical, cached: true, source: "cache" };
    }

    // If we have an ambiguous/intermediate cached result, yield it immediately for instant UI
    if (cachedContext && cachedContext.final === false && onIntermediate) {
       onIntermediate({ ...cachedContext, cached: true, source: "cache" });
    } else if (MEMORY_CACHE.has(contextKey) && MEMORY_CACHE.get(contextKey)!.final === false && onIntermediate) {
       onIntermediate({ ...MEMORY_CACHE.get(contextKey)!, cached: true, source: "cache" });
    }

    // 4. API Fallback — fast dictionary-only guess first, then a background AI upgrade.
    // Most lemmas carry 2+ tied-frequency senses that the dictionary alone can't rank
    // confidently, so this used to always block on an ~8s NVIDIA disambiguation call
    // before showing anything. Now: ask for the instant D1-only answer (skipAi) and show
    // it right away; only if the backend flags it as unresolved/ambiguous (final: false)
    // do we also kick off the slower AI-backed call and silently swap in its answer once
    // it lands, so a genuinely wrong first guess still gets corrected.
    const isUsableResult = (res: SprekioWordResult | undefined | null) =>
      !!res && !!res.translations && res.translations.length > 0 &&
      !["Network error", "Timed out — try again"].includes((res.translations[0] as any)?.text);

    const sendTranslate = (skipAi: boolean, retryCount: number): Promise<SprekioWordResult> =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "translate", word: surface, contextSentence, provider, skipAi },
          (res: SprekioWordResult) => {
            // MV3 service workers can be asleep. If Chrome dropped the message,
            // lastError is set and res is undefined. Retry once after 400ms.
            if (chrome.runtime.lastError || !res) {
              if (retryCount < 1) {
                console.warn("[Sprekio] Service worker wakeup — retrying in 400ms...", chrome.runtime.lastError?.message);
                setTimeout(() => sendTranslate(skipAi, retryCount + 1).then(resolve), 400);
              } else {
                // Give up after 1 retry, return a placeholder so the UI doesn't hang
                resolve({
                  surface,
                  normalized: surface.toLowerCase(),
                  lemma: surface,
                  translations: [{ text: "Network error" }],
                  source: "ai",
                  cached: false,
                  confidence: 0,
                });
              }
              return;
            }
            resolve(res);
          }
        );
      });

    const cacheIfUsable = async (res: SprekioWordResult) => {
      if (!isUsableResult(res)) return;
      this.cachePartOfSpeech(res);
      MEMORY_CACHE.set(contextKey, res);
      await this.saveToCache("contextCache", contextKey, res);
    };

    const fastResult = await sendTranslate(true, 0);
    await cacheIfUsable(fastResult);

    if (fastResult.final !== false) {
      // Single sense, a phrase match, or a genuine context match — the dictionary answer
      // is already authoritative, no need to wait on AI at all.
      return fastResult;
    }

    // Ambiguous: show the fast guess immediately, then refine in the background.
    if (onIntermediate) onIntermediate({ ...fastResult, cached: false, source: "dictionary" });

    const aiResult = await sendTranslate(false, 0);
    if (!isUsableResult(aiResult)) {
      // AI call failed/timed out — keep the reasonable dictionary guess rather than
      // replacing it with an error placeholder.
      return fastResult;
    }
    aiResult.final = true;
    await cacheIfUsable(aiResult);
    return aiResult;
  }

  public static async prefetch(subtitles: { text: string }[]): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Combine subtitles into a rolling context window
    const fullSentence = subtitles.map(s => s.text).join(" ");
    
    // Tokenize
    const tokens = fullSentence.match(/[\wäöüß]+/g) || [];
    const uniqueTokens = [...new Set(tokens)];
    
    // Filter
    const toPrefetch: string[] = [];
    for (const token of uniqueTokens) {
       if (!this.shouldPrefetch()) continue;
       
       const contextKey = this.getContextKey(token, fullSentence);
       const lexicalKey = this.getLexicalKey(token);
       
       if (MEMORY_CACHE.has(contextKey) || MEMORY_CACHE.has(lexicalKey)) continue;
       
       const cachedCtx = await this.getFromCache("contextCache", contextKey);
       if (cachedCtx && cachedCtx.final !== false) continue;
       
       const cachedLex = await this.getFromCache("lexicalCache", lexicalKey);
       if (cachedLex && cachedLex.final) continue;

       toPrefetch.push(token);
    }

    if (toPrefetch.length === 0 || signal.aborted) return;
    
    // Sort by priority so we don't drop important words if we exceed the cap
    toPrefetch.sort((a, b) => {
       const pA = this.getPrefetchPriority(a);
       const pB = this.getPrefetchPriority(b);
       const score = { "HIGH": 3, "NORMAL": 2, "LOW": 1 };
       return score[pB] - score[pA];
    });

    // Cap at 250 (increased from 100 to handle the larger 15-subtitle prefetch window)
    const batchWords = toPrefetch.slice(0, 250);

    try {
      const response = await new Promise<any>((resolve, reject) => {
        chrome.runtime.sendMessage({
           action: "batchLookup",
           words: batchWords,
           sentence: fullSentence
        }, (res) => {
           if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
           else resolve(res);
        });
      });
      
      if (signal.aborted || !response || !response.results) return;

      for (let result of response.results) {
         result.source = "dictionary";
         result.cached = true;
         this.cachePartOfSpeech(result);

         const isFinal = result.final;
         if (isFinal) {
             const key = result.resolution === "lexical" ? this.getLexicalKey(result.surface) : this.getContextKey(result.surface, fullSentence);
             const store = result.resolution === "lexical" ? "lexicalCache" : "contextCache";
             
             MEMORY_CACHE.set(key, result);
             await this.saveToCache(store, key, result);
         } else {
             // It's ambiguous. Cache it in context but NOT as final, so single lookup still runs.
             const key = this.getContextKey(result.surface, fullSentence);
             result.final = false;
             MEMORY_CACHE.set(key, result);
             await this.saveToCache("contextCache", key, result);
         }
      }
    } catch (e) {
      console.warn("Prefetch aborted or failed", e);
    }
  }
}
