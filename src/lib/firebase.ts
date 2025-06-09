import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyB2KDer0QebLKNQBKL4KG917mcX4iwnU8o",
  authDomain: "publimartools.firebaseapp.com",
  projectId: "publimartools",
  storageBucket: "publimartools.firebasestorage.app",
  messagingSenderId: "202477271278",
  appId: "1:202477271278:web:f0aabd5fb12a900fdfdbff",
  measurementId: "G-N64NKFM7PX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Solo inicializa analytics en el cliente
let analytics: any = null;
if (typeof window !== "undefined") {
  import("firebase/analytics").then(({ getAnalytics }) => {
    analytics = getAnalytics(app);
  });
}

export { app, analytics }; 