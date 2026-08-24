import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs, query, where, updateDoc, doc, deleteDoc, orderBy } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA5-pEPCKcO6TATKrWZKGp8AZIt6rdr_WU",
  authDomain: "sperkio-ab832.firebaseapp.com",
  projectId: "sperkio-ab832",
  storageBucket: "sperkio-ab832.firebasestorage.app",
  messagingSenderId: "87574039132",
  appId: "1:87574039132:web:9a069ea70a92103755b499",
  measurementId: "G-0K927093LQ"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, googleProvider, signInWithPopup, signOut, collection, getDocs, query, where, updateDoc, doc, deleteDoc, orderBy };
