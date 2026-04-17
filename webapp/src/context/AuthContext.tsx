import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/firebase";
import type { User } from "@/types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;
const API = `${BACKEND_URL}/api`;

const googleProvider = new GoogleAuthProvider();

// Attach a fresh Firebase ID token to every axios request
axios.interceptors.request.use(async (config) => {
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function loadOrCreateProfile(
  firebaseUser: FirebaseUser,
  overrideName?: string
): Promise<User> {
  const ref = doc(db, "user_profile", firebaseUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    return {
      id: firebaseUser.uid,
      name: data.name || firebaseUser.displayName || firebaseUser.email || "User",
      email: data.email || firebaseUser.email || "",
      picture: data.picture || firebaseUser.photoURL || undefined,
      is_admin: data.is_admin ?? false,
      credits: data.credits,
    };
  }

  // New user — create their profile
  const name = overrideName || firebaseUser.displayName || firebaseUser.email || "User";
  const newProfile = {
    uid: firebaseUser.uid,
    name,
    email: firebaseUser.email || "",
    picture: firebaseUser.photoURL ?? null,
    is_admin: false,
    credits: 0,
    created_at: serverTimestamp(),
  };
  await setDoc(ref, newProfile);
  return {
    id: firebaseUser.uid,
    name,
    email: newProfile.email,
    picture: newProfile.picture ?? undefined,
    is_admin: false,
    credits: 0,
  };
}

interface AuthContextValue {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Holds the display name during email sign-up so onAuthStateChanged can use it
  const pendingSignupName = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const overrideName = pendingSignupName.current ?? undefined;
          pendingSignupName.current = null;
          const profile = await loadOrCreateProfile(firebaseUser, overrideName);
          setUser(profile);
        } catch {
          // Fallback to basic Firebase user info if Firestore is unavailable
          setUser({
            id: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email || "User",
            email: firebaseUser.email || "",
            picture: firebaseUser.photoURL ?? undefined,
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    await signInWithPopup(auth, googleProvider);
    // onAuthStateChanged fires and loads/creates the profile
  };

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signupWithEmail = async (
    email: string,
    password: string,
    displayName: string
  ) => {
    // Set the name before creating the user so onAuthStateChanged can pick it up
    pendingSignupName.current = displayName;
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });
  };

  const logout = async () => {
    await signOut(auth);
  };

  // Kept for API compatibility — Firebase manages auth state reactively
  const checkAuth = async () => {};

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, loginWithEmail, signupWithEmail, logout, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export { AuthContext, API, BACKEND_URL };
