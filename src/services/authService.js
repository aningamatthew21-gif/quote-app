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
        await emailjs.send(
            "service_9vyihng",
            "template_ec3cg56",
            { passcode, email },
            "yqjG5KtoapsXlV6Pj"
        );
        return passcode;
    }

    async verifyEmailExists(email) {
        const userRef = doc(this.db, 'users', String(email).trim());
        const userSnap = await getDoc(userRef);
        return userSnap.exists();
    }
};
