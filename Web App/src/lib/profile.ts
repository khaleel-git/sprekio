"use client";

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { UserProgress, getLevelFromXP, checkStreak } from "./store";

/**
 * The XP/streak/level half of UserProgress, persisted to Firestore (users/{uid}) for
 * logged-in users instead of localStorage. communityStories is deliberately excluded —
 * Community stays a local-only feature for now, out of this unification's scope.
 */
export type CloudProgress = Omit<UserProgress, "communityStories">;

const DEFAULT_CLOUD_PROGRESS: CloudProgress = {
  completedStories: [],
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  level: 1,
  upvotedStories: [],
};

export async function getOrCreateProfile(uid: string): Promise<CloudProgress> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const data = snap.data();

  if (data && data.xp !== undefined) {
    return {
      completedStories: data.completedStories || [],
      xp: data.xp || 0,
      streak: data.streak || 0,
      lastActiveDate: data.lastActiveDate || null,
      level: data.level || 1,
      upvotedStories: data.upvotedStories || [],
    };
  }

  // First time this user has a profile doc touched — merge so we don't clobber
  // unrelated fields Firestore might already hold on users/{uid}.
  await setDoc(ref, DEFAULT_CLOUD_PROGRESS, { merge: true });
  return DEFAULT_CLOUD_PROGRESS;
}

/** Call once per page load for a logged-in user; only writes when the day actually changed. */
export async function touchStreak(uid: string, current: CloudProgress): Promise<CloudProgress> {
  const updated = checkStreak(current);
  if (updated.lastActiveDate !== current.lastActiveDate) {
    await updateDoc(doc(db, "users", uid), {
      streak: updated.streak,
      lastActiveDate: updated.lastActiveDate,
    });
  }
  return updated;
}

export async function addXp(uid: string, current: CloudProgress, amount: number): Promise<CloudProgress> {
  const xp = current.xp + amount;
  const level = getLevelFromXP(xp);
  await updateDoc(doc(db, "users", uid), { xp, level });
  return { ...current, xp, level };
}

export async function completeStoryCloud(
  uid: string,
  current: CloudProgress,
  storyId: string,
  xpEarned: number
): Promise<CloudProgress> {
  const alreadyDone = current.completedStories.includes(storyId);
  const xpGain = alreadyDone ? Math.floor(xpEarned / 3) : xpEarned;
  const xp = current.xp + xpGain;
  const completedStories = alreadyDone
    ? current.completedStories
    : [...current.completedStories, storyId];
  const level = getLevelFromXP(xp);
  await updateDoc(doc(db, "users", uid), { completedStories, xp, level });
  return { ...current, completedStories, xp, level };
}

/**
 * One-time fold of a guest's local progress into their cloud profile on first login.
 * Takes the max of xp/streak (rather than summing) since the guest session and any prior
 * cloud session were tracking overlapping activity, not additive activity.
 */
export async function mergeLocalProgressIntoCloud(
  uid: string,
  local: UserProgress,
  cloud: CloudProgress
): Promise<CloudProgress> {
  const xp = Math.max(local.xp, cloud.xp);
  const merged: CloudProgress = {
    xp,
    streak: Math.max(local.streak, cloud.streak),
    lastActiveDate: cloud.lastActiveDate || local.lastActiveDate,
    completedStories: Array.from(new Set([...cloud.completedStories, ...local.completedStories])),
    upvotedStories: Array.from(new Set([...cloud.upvotedStories, ...local.upvotedStories])),
    level: getLevelFromXP(xp),
  };
  await setDoc(doc(db, "users", uid), merged, { merge: true });
  return merged;
}
