import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import emailjs from '@emailjs/browser';


export class AuthService {
    constructor(db) {
        this.db = db;
    }

    async getUserByEmail(email) {
        console.log('🔍 [DEBUG] AuthService: Getting user by email:', email);
        const userRef = doc(this.db, 'users', String(email).trim());
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            console.log('🔍 [DEBUG] AuthService: No user found for email');
            return null;
        }
        const data = userSnap.data();
        console.log('🔍 [DEBUG] AuthService: User data:', data);
        return data;
    }

    async createUser(email, role = 'sales') {
        console.log('📝 [DEBUG] AuthService: Creating new user:', email);
        const userRef = doc(this.db, 'users', String(email).trim());
        const newUser = {
            email: String(email).trim(),
            role: role,
            createdAt: new Date().toISOString(),
            name: String(email).split('@')[0],
            status: 'active'
        };
        await setDoc(userRef, newUser);
        console.log('✅ [DEBUG] AuthService: User created successfully');
        return newUser;
    }

    async validateOtp(email, otp) {
        const otpRef = doc(this.db, 'otps', String(email).trim());
        const otpSnap = await getDoc(otpRef);
        const result = otpSnap.data().otp == Number(otp);
        return result;
    }

    async generateOtp(email) {
        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpRef = doc(this.db, 'otps', String(email).trim());
        await setDoc(otpRef, { otp, createdAt: new Date() });
        return otp;
    }

    async deleteOtp(email) {
        const otpRef = doc(this.db, 'otps', String(email).trim());
        await deleteDoc(otpRef);
    }

    async sendOtp(email) {
        const passcode = await this.generateOtp(email);
        console.log('🔍 [DEBUG] AuthService: Sending OTP to email:', email);
        console.log('🔒 [DEV MODE] OTP generated:', passcode);
        // await emailjs.send(
        //     "service_9vyihng",
        //     "template_ec3cg56",
        //     { passcode, email },
        //     "yqjG5KtoapsXlV6Pj"
        // );
        return passcode;
    }

    async verifyEmailExists(email) {
        const userRef = doc(this.db, 'users', String(email).trim());
        const userSnap = await getDoc(userRef);
        return userSnap.exists();
    }
};
