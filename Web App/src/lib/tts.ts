// Text-to-Speech wrapper using Web Speech API

export interface TTSOptions {
  lang?: string;
  rate?: number;    // 0.1 - 10, default 1
  pitch?: number;   // 0 - 2, default 1
  volume?: number;  // 0 - 1, default 1
  voiceName?: string;
  onBoundary?: (charIndex: number, charLength: number) => void;
}

export interface TTSVoice {
  name: string;
  lang: string;
  localService: boolean;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;
let isExplicitlyStopped = false;

// The browser's native onboundary event is unreliable across browsers/voices — some
// fire per-word, some per-sentence, some not at all — which made the read-along
// highlight freeze or jump depending on which voice happened to be selected. Same
// problem the Chrome extension solved for YouTube captions: trust real per-word timing
// when it's actually granular, otherwise fall back to a smooth time-based estimate so
// the highlight always progresses steadily through the text.
function getWordSpans(text: string): { charIndex: number; charLength: number }[] {
  const spans: { charIndex: number; charLength: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    spans.push({ charIndex: m.index, charLength: m[0].length });
  }
  return spans;
}

export function getGermanVoices(): TTSVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.startsWith("de"))
    .map((v) => ({ name: v.name, lang: v.lang, localService: v.localService }));
}

export function speak(text: string, options: TTSOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      reject(new Error("Speech synthesis not supported"));
      return;
    }

    // Stop any current speech
    stopSpeaking();
    isExplicitlyStopped = false;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || "de-DE";
    utterance.rate = options.rate || 0.9;
    utterance.pitch = options.pitch || 1;
    utterance.volume = options.volume || 1;

    // Try to use a German voice
    const voices = window.speechSynthesis.getVoices();
    const germanVoices = voices.filter((v) => v.lang.startsWith("de"));

    if (options.voiceName) {
      const preferred = voices.find((v) => v.name === options.voiceName);
      if (preferred) utterance.voice = preferred;
    } else if (germanVoices.length > 0) {
      // Prefer local service voices
      const local = germanVoices.find((v) => v.localService);
      utterance.voice = local || germanVoices[0];
    }

    let estimateTimer: ReturnType<typeof setInterval> | null = null;
    const stopEstimator = () => {
      if (estimateTimer) {
        clearInterval(estimateTimer);
        estimateTimer = null;
      }
    };

    utterance.onend = () => {
      stopEstimator();
      currentUtterance = null;
      resolve();
    };

    if (options.onBoundary) {
      let lastRealEventAt = 0;

      utterance.onboundary = (event) => {
        if (event.name === "word") {
          lastRealEventAt = performance.now();
          options.onBoundary!(event.charIndex, event.charLength);
        }
      };

      // Smooth fallback: estimate word position from elapsed time. Real boundary
      // events (when the browser/voice actually fires them) always win — the
      // estimator only speaks up when none has landed in the last 250ms, so a voice
      // with good native timing looks identical to before, and one without gets a
      // steady highlight instead of a frozen one.
      const spans = getWordSpans(text);
      const msPerWord = 380 / (options.rate || 0.9);
      const startTime = performance.now();
      estimateTimer = setInterval(() => {
        const now = performance.now();
        if (now - lastRealEventAt < 250) return;
        const wordIndex = Math.min(spans.length - 1, Math.floor((now - startTime) / msPerWord));
        const span = spans[wordIndex];
        if (span) options.onBoundary!(span.charIndex, span.charLength);
      }, 90);
    }

    utterance.onerror = (e) => {
      stopEstimator();
      currentUtterance = null;
      if (isExplicitlyStopped) {
        reject(new Error("Stopped explicitly"));
      } else {
        if (e.error !== "interrupted") reject(e);
        else resolve();
      }
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    isExplicitlyStopped = true;
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

export function isSpeaking(): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  return window.speechSynthesis.speaking;
}

export function isPaused(): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  return window.speechSynthesis.paused;
}

export function pauseSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.pause();
  }
}

export function resumeSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.resume();
  }
}

// Speak paragraph by paragraph with callback
export async function speakParagraphs(
  paragraphs: string[],
  options: TTSOptions = {},
  onParagraph?: (index: number) => void
): Promise<void> {
  for (let i = 0; i < paragraphs.length; i++) {
    if (onParagraph) onParagraph(i);
    await speak(paragraphs[i], options);
  }
}
