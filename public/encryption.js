// End-to-End Encryption Module using AES-256-GCM
class E2EEncryption {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyLength = 256;
        this.key = null;
    }

    // Generate a random encryption key
    async generateKey() {
        this.key = await window.crypto.subtle.generateKey(
            {
                name: this.algorithm,
                length: this.keyLength
            },
            true, // extractable
            ['encrypt', 'decrypt']
        );
        return this.key;
    }

    // Export key to base64 for display/sharing
    async exportKey() {
        if (!this.key) {
            await this.generateKey();
        }
        const exported = await window.crypto.subtle.exportKey('raw', this.key);
        return this.arrayBufferToBase64(exported);
    }

    // Import key from base64
    async importKey(base64Key) {
        const keyData = this.base64ToArrayBuffer(base64Key);
        this.key = await window.crypto.subtle.importKey(
            'raw',
            keyData,
            {
                name: this.algorithm,
                length: this.keyLength
            },
            true,
            ['encrypt', 'decrypt']
        );
        return this.key;
    }

    // Encrypt a message
    async encrypt(message) {
        if (!this.key) {
            await this.generateKey();
        }

        // Generate a random initialization vector
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        // Encode the message
        const encoder = new TextEncoder();
        const encodedMessage = encoder.encode(message);

        // Encrypt
        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: this.algorithm,
                iv: iv
            },
            this.key,
            encodedMessage
        );

        // Combine IV and encrypted data
        const combined = new Uint8Array(iv.length + encryptedData.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encryptedData), iv.length);

        // Convert to base64 for transmission
        return this.arrayBufferToBase64(combined.buffer);
    }

    // Decrypt a message
    async decrypt(encryptedBase64) {
        if (!this.key) {
            throw new Error('No encryption key available');
        }

        // Convert from base64
        const combined = this.base64ToArrayBuffer(encryptedBase64);
        
        // Extract IV and encrypted data
        const iv = combined.slice(0, 12);
        const encryptedData = combined.slice(12);

        // Decrypt
        const decryptedData = await window.crypto.subtle.decrypt(
            {
                name: this.algorithm,
                iv: iv
            },
            this.key,
            encryptedData
        );

        // Decode the message
        const decoder = new TextDecoder();
        return decoder.decode(decryptedData);
    }

    // Helper: Convert ArrayBuffer to base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Helper: Convert base64 to ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// Create global encryption instance
const encryption = new E2EEncryption();

// Initialize encryption on page load
(async () => {
    await encryption.generateKey();
    console.log('🔐 E2E Encryption initialized with AES-256-GCM');
})();
