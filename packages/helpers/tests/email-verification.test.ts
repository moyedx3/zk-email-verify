import { generateEmailVerifierInputs } from '../src/input-generators';
import fs from "fs";
import path from "path";

describe('Email Verification', () => {
    it('should generate email verifier inputs correctly', async () => {
        try {
            // Read the email file
            const emailPath = path.join(__dirname, 'test-data/beras.eml');
            const email = fs.readFileSync(emailPath);

            console.log('Testing generateEmailVerifierInputs:');
            const inputs = await generateEmailVerifierInputs(email);
            console.log('Inputs generated:');
            Object.entries(inputs).forEach(([key, value]) => {
                if (typeof value === 'string' && value.length > 100) {
                    console.log(`${key}: ${value.substring(0, 100)}...`);
                } else {
                    console.log(`${key}:`, value);
                }
            });

        } catch (error) {
            console.error('Error:', error);
        }
    });
});