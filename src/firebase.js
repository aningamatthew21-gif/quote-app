import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCiRyWj3d9V0V_KwiNG7MxChUvKiqi6tDE",
    authDomain: "quote-system-a7e73.firebaseapp.com",
    projectId: "quote-system-a7e73",
    storageBucket: "quote-system-a7e73.appspot.com",
    messagingSenderId: "165157467841",
    appId: "1:165157467841:web:e5d8e305ed8d361b134640",
    measurementId: "G-4XD5MCBTWY"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
