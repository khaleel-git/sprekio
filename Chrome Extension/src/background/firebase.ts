import { initializeApp } from "firebase/app";
import { initializeAuth, indexedDBLocalPersistence, signInWithCredential, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, where, updateDoc, orderBy, doc, deleteDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA5-pEPCKcO6TATKrWZKGp8AZIt6rdr_WU",
  authDomain: "sperkio-ab832.firebaseapp.com",
  projectId: "sperkio-ab832",
  storageBucket: "sperkio-ab832.firebasestorage.app",
  messagingSenderId: "87574039132",
  appId: "1:87574039132:web:9a069ea70a92103755b499",
  measurementId: "G-0K927093LQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth for Chrome Extension Service Worker
export const auth = initializeAuth(app, {
  persistence: indexedDBLocalPersistence
});

export const db = getFirestore(app);

// Helper function to handle Google Login via Chrome Identity
export async function loginWithGoogle() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        return reject(chrome.runtime.lastError?.message || "Failed to get auth token");
      }
      try {
        const credential = GoogleAuthProvider.credential(null, token);
        const userCredential = await signInWithCredential(auth, credential);
        resolve(userCredential.user);
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Helper function to save a word
export async function saveVocabularyWord(word: string, translationData: any, contextSentence: string, videoId?: string, videoTitle?: string) {
  if (!auth.currentUser) throw new Error("User not logged in");
  
  const userVocabRef = collection(db, "users", auth.currentUser.uid, "vocabulary");
  
  // Check if word already exists
  const q = query(userVocabRef, where("word", "==", word));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    // Word exists, update it with the latest context and increment saveCount
    const existingDoc = snapshot.docs[0];
    const data = existingDoc.data();
    await updateDoc(existingDoc.ref, {
      contextSentence: contextSentence,
      videoId: videoId || data.videoId || null,
      videoTitle: videoTitle || data.videoTitle || null,
      saveCount: (data.saveCount || 1) + 1,
      savedAt: serverTimestamp()
    });
  } else {
    // Word is new, add it with saveCount: 1
    await addDoc(userVocabRef, {
      word: word,
      lemma: translationData.lemma || word,
      translation: translationData.translations?.[0]?.text || null,
      partOfSpeech: translationData.partOfSpeech || null,
      gender: translationData.gender || null,
      case: translationData.case || null,
      contextSentence: contextSentence,
      videoId: videoId || null,
      videoTitle: videoTitle || null,
      status: "new",
      saveCount: 1,
      savedAt: serverTimestamp()
    });
  }
}

// Helper function to fetch all saved words
export async function getVocabularyWords() {
  if (!auth.currentUser) throw new Error("User not logged in");
  
  const userVocabRef = collection(db, "users", auth.currentUser.uid, "vocabulary");
  // Order by savedAt descending
  const q = query(userVocabRef, orderBy("savedAt", "desc"));
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    savedAt: doc.data().savedAt?.toDate().toISOString() // Convert timestamp to string for message passing
  }));
}

export async function deleteVocabWord(id: string) {
  if (!auth.currentUser) throw new Error("User not logged in");
  const docRef = doc(db, "users", auth.currentUser.uid, "vocabulary", id);
  await deleteDoc(docRef);
}

export async function updateVocabWordStatus(id: string, status: 'learning' | 'learned') {
  if (!auth.currentUser) throw new Error("User not logged in");
  const docRef = doc(db, "users", auth.currentUser.uid, "vocabulary", id);
  await updateDoc(docRef, { status });
}

