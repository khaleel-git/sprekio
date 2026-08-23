export interface WordDetails {
  translation: string;
  type: string;
  gender?: string;
  case?: string;
  root?: string;
}

export async function fetchWordTranslation(word: string, contextSentence: string): Promise<WordDetails | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "translate", word, contextSentence },
      (response) => {
        resolve(response as WordDetails);
      }
    );
  });
}
