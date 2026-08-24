import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA5-pEPCKcO6TATKrWZKGp8AZIt6rdr_WU",
  authDomain: "sperkio-ab832.firebaseapp.com",
  projectId: "sperkio-ab832",
  storageBucket: "sperkio-ab832.firebasestorage.app",
  messagingSenderId: "87574039132",
  appId: "1:87574039132:web:9a069ea70a92103755b499",
  measurementId: "G-0K927093LQ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { success: true, user: result.user };
  } catch (error: any) {
    console.error("Firebase Login Error:", error);
    return { success: false, error: error.message };
  }
};

export const logout = async () => {
  await signOut(auth);
};

export const getVocabularyWords = async (userId: string) => {
  try {
    const snapshot = await getDocs(collection(db, "users", userId, "vocabulary"));
    const allWords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    
    // Sort descending by timestamp so newest duplicates come first
    allWords.sort((a: any, b: any) => {
      const timeA = a.savedAt?.seconds ? a.savedAt.seconds * 1000 : 0;
      const timeB = b.savedAt?.seconds ? b.savedAt.seconds * 1000 : 0;
      return timeB - timeA;
    });

    // Deduplicate by word (case-insensitive)
    const seen = new Set();
    const words = allWords.filter(w => {
      const key = (w.word || '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { success: true, words };
  } catch (error: any) {
    return { success: false, error: error.message, words: [] };
  }
};

export const deleteVocabularyWord = async (userId: string, wordId: string) => {
  try {
    await deleteDoc(doc(db, "users", userId, "vocabulary", wordId));
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting word:", error);
    return { success: false, error: error.message };
  }
};

export const updateVocabularyWordStatus = async (userId: string, wordId: string, status: 'learning' | 'learned') => {
  try {
    await updateDoc(doc(db, "users", userId, "vocabulary", wordId), { status });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating status:", error);
    return { success: false, error: error.message };
  }
};
