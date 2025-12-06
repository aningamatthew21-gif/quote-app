import { db } from './firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const email = 'aningamatthew21+salse@gmail.com';

async function checkAndCreateUser() {
    try {
        console.log(`Checking for user: ${email}`);
        const userRef = doc(db, 'users', email);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            console.log('User exists:', userSnap.data());
        } else {
            console.log('User does not exist. Creating user...');
            const newUser = {
                email: email,
                role: 'sales', // Default role
                createdAt: new Date().toISOString(),
                name: 'Matthew Aninga' // Placeholder name
            };
            await setDoc(userRef, newUser);
            console.log('User created successfully:', newUser);
        }
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkAndCreateUser();
