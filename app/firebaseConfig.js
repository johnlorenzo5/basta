import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA9zLYfqpBe377PrH8osmbZvwQgXsfH8d8",
  authDomain: "final-d9a69.firebaseapp.com",
  projectId: "final-d9a69",
  storageBucket: "final-d9a69.appspot.com",
  messagingSenderId: "742533901240",
  appId: "1:742533901240:web:cc29882e37162d97f4fd4d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 🔥 IMPORTANT: Firestore DB
export const db = getFirestore(app);