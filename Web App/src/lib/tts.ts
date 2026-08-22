// Text-to-Speech wrapper using Web Speech API

export interface TTSOptions {
  lang?: string;
  rate?: number;    // 0.1 - 10, default 1
  pitch?: number;   // 0 - 2, default 1
  volume?: number;  // 0 - 1, default 1
  voiceName?: string;
}

export interface TTSVoice {
  name: string;
  lang: string;
  localService: boolean;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

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

    utterance.onend = () => {
      currentUtterance = null;
      resolve();
    };
    utterance.onerror = (e) => {
      currentUtterance = null;
      if (e.error !== "interrupted") reject(e);
      else resolve();
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
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
