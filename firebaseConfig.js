import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { createClient } from "@supabase/supabase-js";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCOOTpA3z0x1hnpWuGx5r8YJneS9LlquW4",
  authDomain: "pricelister-service.firebaseapp.com",
  projectId: "pricelister-service",
  storageBucket: "pricelister-service.firebasestorage.app",
  messagingSenderId: "761541292596",
  appId: "1:761541292596:web:18f807948f5a057713d061",
  measurementId: "G-7SQ9KE8V4Q"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Supabase Connection
const SUPABASE_URL = "https://chewglmfaggzmlguglpg.supabase.co";
const SUPABASE_KEY = "sb_publishable_TRH_eIv-Pv4IUVUJ0-mRLg_uxOc7z5R";
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export { signInWithPopup, signOut, onAuthStateChanged };