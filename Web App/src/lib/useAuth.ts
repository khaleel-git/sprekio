"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import { mergeLocalDeckIntoFirestore } from "./vocab";
import { getOrCreateProfile, mergeLocalProgressIntoCloud } from "./profile";
import { UserProgress } from "./store";
import { VocabCard } from "./srs";

function migrationFlagKey(uid: string) {
  return `dl_cloud_merged_${uid}`;
}

/**
 * The first time a given browser's guest (localStorage) progress meets a logged-in
 * account, fold it into that account's Firestore data exactly once, so signing in never
 * silently discards prior local work. Runs from useAuth (mounted globally via Nav) so it
 * fires no matter which page the user happens to land on after logging in.
 */
async function migrateLocalDataOnce(uid: string) {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(migrationFlagKey(uid))) return;

  try {
    const savedDeck = localStorage.getItem("dl_vocab_deck");
    const savedProgress = localStorage.getItem("dl_progress");
    const localDeck: VocabCard[] = savedDeck ? JSON.parse(savedDeck) : [];
    const localProgress: UserProgress | null = savedProgress ? JSON.parse(savedProgress) : null;

    if (localDeck.length > 0) {
      await mergeLocalDeckIntoFirestore(uid, localDeck);
    }
    if (localProgress) {
      const cloud = await getOrCreateProfile(uid);
      await mergeLocalProgressIntoCloud(uid, localProgress, cloud);
    }
  } catch (e) {
    console.warn("Sprekio: local progress merge failed", e);
  } finally {
    // Mark done even on partial failure — this is a one-time best-effort import, not
    // something that should retry forever and risk duplicate imports.
    localStorage.setItem(migrationFlagKey(uid), "1");
  }
}

/**
 * Shared login state for every page — previously only /dashboard checked Firebase auth,
 * so Nav and the rest of the site had no idea whether a visitor was signed in.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) migrateLocalDataOnce(u.uid);
    });
    return unsub;
  }, []);

  return { user, loading };
}
