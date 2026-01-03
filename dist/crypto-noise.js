/* Copyright(C) 2017-2025, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * crypto-noise.ts: A complete Node-native Noise_NNpsk0_25519_ChaChaPoly_SHA256 handshake implementation with no external dependencies.
 */
import { createCipheriv, createDecipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import { Buffer } from "node:buffer";
// Protocol constants that define the specific Noise protocol variant we're implementing.
const PROTOCOL_NAME = "Noise_NNpsk0_25519_ChaChaPoly_SHA256";
const DH_LEN = 32;
const CIPHER_ALGO = "chacha20-poly1305";
const AUTH_TAG_LEN = 16;
const HASH_ALGO = "sha256";
// Cached empty buffer to avoid repeated allocations for commonly used empty buffers.
const EMPTY_BUFFER = Buffer.alloc(0);
/**
 * Maximum Noise protocol message length as specified in the Noise Protocol Framework.
 */
export const NOISE_MAX_MESSAGE_LEN = 65535;
/**
 * Required length for pre-shared keys in bytes.
 */
export const NOISE_PSK_LEN = 32;
/**
 * Length of Diffie-Hellman public keys in bytes.
 */
export const NOISE_DH_LEN = 32;
/**
 * ESPHome Noise protocol prologue prefix used for all ESPHome API connections. This identifies the connection as using the ESPHome Native API protocol.
 */
export const ESPHOME_NOISE_PROLOGUE = "NoiseAPIInit\x00\x00";
// Cache the protocol name hash since it never changes.
const PROTOCOL_NAME_HASH = (() => {
    const nameBuf = Buffer.from(PROTOCOL_NAME, "ascii");
    if (nameBuf.length <= 32) {
        const h = Buffer.alloc(32);
        nameBuf.copy(h);
        return h;
    }
    return createHash(HASH_ALGO).update(nameBuf).digest();
})();
// The NNpsk0 handshake pattern: first message mixes PSK and sends ephemeral, second message sends ephemeral and performs DH.
const NNPSK0_PATTERN = [
    ["psk", "e"],
    ["e", "ee"]
];
/**
 * Custom error class for Noise protocol errors with error codes for better error handling.
 */
export class NoiseHandshakeError extends Error {
    code;
    /**
     * Creates a new NoiseHandshakeError.
     * @param message - The error message.
     * @param code - A machine-readable error code.
     */
    constructor(message, code) {
        super(message);
        this.code = code;
        this.code = code;
        this.name = "NoiseHandshakeError";
    }
}
/**
 * Generates an X25519 key pair and returns both the private key and raw 32-byte public key.
 * This encapsulates the Node.js crypto API complexity for cleaner usage throughout the code.
 */
function generateX25519KeyPair() {
    const { publicKey, privateKey } = generateKeyPairSync("x25519");
    // Export directly as SPKI DER and extract the last 32 bytes which contain the raw public key. We do this as an efficiency win rather than going through
    // JWK encoding/decoding.
    const spki = publicKey.export({ format: "der", type: "spki" });
    const publicKeyRaw = spki.subarray(spki.length - 32);
    return { privateKey, publicKeyRaw };
}
/**
 * Creates an X25519 public key object from raw 32-byte key material.
 * This handles the SPKI DER construction that Node.js requires for key import.
 */
function importX25519PublicKey(rawKey) {
    // SPKI DER prefix for X25519 keys (OID 1.3.101.110). The raw key follows this prefix.
    const spkiPrefix = Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00]);
    const spkiDer = Buffer.concat([spkiPrefix, rawKey]);
    return createPublicKey({ format: "der", key: spkiDer, type: "spki" });
}
function hkdf(chainingKey, ikm, numOutputs) {
    const outputLength = 32 * numOutputs;
    // The Noise Protocol's HKDF matches RFC 5869 with an empty info parameter. The chaining key serves as the salt.
    const derivedKeyArray = hkdfSync(HASH_ALGO, ikm, chainingKey, EMPTY_BUFFER, outputLength);
    // Convert ArrayBuffer to Buffer and split into separate 32-byte keys.
    const derivedKey = Buffer.from(derivedKeyArray);
    if (numOutputs === 2) {
        return [derivedKey.subarray(0, 32), derivedKey.subarray(32, 64)];
    }
    else {
        return [derivedKey.subarray(0, 32), derivedKey.subarray(32, 64), derivedKey.subarray(64, 96)];
    }
}
/**
 * CipherState manages the encryption state for a single direction of communication.
 * Implements the CipherState object as specified in Noise Protocol Framework §5.1 using ChaCha20-Poly1305.
 */
export class CipherState {
    log;
    // Our encryption key.
    k;
    // The nonce counter for ChaCha20-Poly1305.
    n;
    // The nonce buffer.
    nonce;
    constructor(log) {
        this.log = log;
        // Initialize our class. We allocate the nonce buffer only once as a performance optimization and reuse it throughout our session.
        this.k = null;
        this.n = BigInt(0);
        this.nonce = Buffer.alloc(12);
    }
    /**
     * Initializes the cipher state with a new key, resetting the nonce counter to zero.
     */
    InitializeKey(key) {
        this.k = key;
        this.n = BigInt(0);
        this.log?.debug("CipherState: Key initialized, hasKey=" + (key !== null) + ".");
    }
    /**
     * Checks whether this cipher state has an encryption key set.
     */
    HasKey() {
        return this.k !== null;
    }
    /**
     * Updates the reusable nonce buffer with the current counter value in little-endian format at offset 4.
     */
    updateNonce() {
        // The first four bytes are always zeros per ChaCha20-Poly1305 specification.
        this.nonce.fill(0, 0, 4);
        this.nonce.writeBigUInt64LE(this.n, 4);
        return this.nonce;
    }
    /**
     * Encrypts plaintext with associated data using ChaCha20-Poly1305. Returns plaintext unchanged if no key is set.
     */
    EncryptWithAd(ad, plaintext) {
        // Without a key, return plaintext unchanged (happens during handshake before encryption is established).
        if (!this.HasKey() || (this.k === null)) {
            return plaintext;
        }
        if (plaintext.length + AUTH_TAG_LEN > NOISE_MAX_MESSAGE_LEN) {
            throw new NoiseHandshakeError("Message too long", "MSG_TOO_LONG");
        }
        const cipher = createCipheriv(CIPHER_ALGO, this.k, this.updateNonce(), { authTagLength: AUTH_TAG_LEN });
        // We specify plaintextLength here to ensure we're forward-compatible with Node 22 and beyond.
        cipher.setAAD(ad, { plaintextLength: plaintext.length });
        // For empty plaintext, we still need to generate the auth tag.
        const ct = plaintext.length === 0 ? cipher.final() : Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();
        this.log?.debug("CipherState: Encrypted with nonce=" + this.n + ", plaintext=" + plaintext.length + " bytes, ciphertext=" + ct.length + " bytes.");
        this.n++;
        return Buffer.concat([ct, tag]);
    }
    /**
     * Decrypts ciphertext with associated data using ChaCha20-Poly1305. Returns input unchanged if no key is set.
     */
    DecryptWithAd(ad, data) {
        // Without a key, return data unchanged (happens during handshake before encryption is established).
        if (!this.HasKey() || (this.k === null)) {
            return data;
        }
        // We reject packets that are shorter than our tag length.
        if (data.length < AUTH_TAG_LEN) {
            throw new NoiseHandshakeError("Ciphertext too short", "CT_TOO_SHORT");
        }
        // Split the input into ciphertext and authentication tag.
        const ciphertext = data.subarray(0, data.length - AUTH_TAG_LEN);
        const tag = data.subarray(data.length - AUTH_TAG_LEN);
        const decipher = createDecipheriv(CIPHER_ALGO, this.k, this.updateNonce(), { authTagLength: AUTH_TAG_LEN });
        decipher.setAAD(ad, { plaintextLength: ciphertext.length });
        decipher.setAuthTag(tag);
        try {
            // For empty ciphertext, just verify the tag without calling update.
            const pt = ciphertext.length === 0 ? decipher.final() : Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            this.log?.debug("CipherState: Decrypted with nonce=" + this.n + ", ciphertext=" + ciphertext.length + " bytes, plaintext=" + pt.length + " bytes.");
            this.n++;
            return pt;
        }
        catch (e) {
            if (e instanceof Error) {
                this.log?.error("CipherState: Decryption failed: " + e.message + ".");
            }
            throw new NoiseHandshakeError("Authentication failed", "AUTH_FAILED");
        }
    }
    /**
     * Rekeys the cipher state by encrypting zeros with the maximum nonce value, providing forward secrecy.
     */
    Rekey() {
        if (!this.HasKey() || (this.k === null)) {
            return;
        }
        // Use the maximum possible nonce value (2^64 - 1) for the rekey operation.
        const maxNonce = (BigInt(1) << BigInt(64)) - BigInt(1);
        this.nonce.fill(0, 0, 4);
        this.nonce.writeBigUInt64LE(maxNonce, 4);
        // Encrypt 32 bytes of zeros to generate the new key material. Must be zeros for the rekey operation.
        const zeros = Buffer.alloc(32);
        const cipher = createCipheriv(CIPHER_ALGO, this.k, this.nonce, { authTagLength: AUTH_TAG_LEN });
        cipher.setAAD(EMPTY_BUFFER, { plaintextLength: zeros.length });
        const ct = Buffer.concat([cipher.update(zeros), cipher.final()]);
        // The first 32 bytes of the ciphertext become our new key.
        this.InitializeKey(ct.subarray(0, 32));
        this.log?.debug("CipherState: Rekey operation completed successfully.");
    }
}
/**
 * SymmetricState manages the symmetric cryptography operations during the handshake.
 * Implements the SymmetricState object as specified in Noise Protocol Framework §5.2.
 */
class SymmetricState {
    log;
    // The chaining key for key derivation.
    ck = Buffer.alloc(0);
    // The handshake hash.
    h = Buffer.alloc(0);
    // The cipher state for encryption/decryption.
    cs;
    constructor(log) {
        this.log = log;
        this.cs = new CipherState(log);
    }
    /**
     * Initializes the symmetric state with the protocol name, setting up initial handshake hash and chaining key.
     */
    InitializeSymmetric() {
        // Use the cached protocol name hash for efficiency.
        this.h = Buffer.from(PROTOCOL_NAME_HASH);
        this.ck = Buffer.from(PROTOCOL_NAME_HASH);
        // We initialize the cipher state with no key.
        this.cs.InitializeKey(null);
        this.log?.debug("SymmetricState: Initialized with protocol \"" + PROTOCOL_NAME + "\".");
    }
    /**
     * Mixes data into the handshake hash to maintain a running hash of all handshake data for authentication.
     */
    MixHash(data) {
        this.h = createHash(HASH_ALGO).update(Buffer.concat([this.h, data])).digest();
        this.log?.debug("SymmetricState: Mixed data into hash, new h=" + this.h.toString("hex") + ".");
    }
    /**
     * Mixes input key material into the chaining key and derives a new encryption key.
     */
    MixKey(ikm) {
        const [ck, tempK] = hkdf(this.ck, ikm, 2);
        this.ck = ck;
        this.cs.InitializeKey(tempK);
        this.log?.debug("SymmetricState: Mixed key material, new ck=" + ck.toString("hex") + ".");
    }
    /**
     * Mixes input key material into both the chaining key and handshake hash (used for PSK operations).
     */
    MixKeyAndHash(ikm) {
        const [ck, tempH, tempK] = hkdf(this.ck, ikm, 3);
        this.ck = ck;
        this.MixHash(tempH);
        this.cs.InitializeKey(tempK);
        this.log?.debug("SymmetricState: Mixed key and hash with PSK material.");
    }
    /**
     * Encrypts plaintext and mixes the ciphertext into the handshake hash.
     */
    EncryptAndHash(plaintext) {
        const c = this.cs.EncryptWithAd(this.h, plaintext);
        this.MixHash(c);
        return c;
    }
    /**
     * Decrypts ciphertext and mixes it into the handshake hash.
     */
    DecryptAndHash(ciphertext) {
        const p = this.cs.DecryptWithAd(this.h, ciphertext);
        // Mix the ciphertext into the handshake hash.
        this.MixHash(ciphertext);
        return p;
    }
    /**
     * Splits the symmetric state into two cipher states for bidirectional communication at handshake completion.
     */
    Split() {
        // Derive both keys at once using HKDF, which is more efficient than separate calls. We get both 32-byte keys at once here.
        const derivedKey = Buffer.from(hkdfSync(HASH_ALGO, EMPTY_BUFFER, this.ck, EMPTY_BUFFER, 64));
        const c1 = new CipherState(this.log);
        const c2 = new CipherState(this.log);
        // Use subarray to create views without copying the underlying buffer.
        c1.InitializeKey(derivedKey.subarray(0, 32));
        c2.InitializeKey(derivedKey.subarray(32, 64));
        this.log?.debug("SymmetricState: Split into two cipher states for transport encryption.");
        return [c1, c2];
    }
}
/**
 * HandshakeState manages the complete Noise protocol handshake, implementing the NNpsk0 pattern with optional prologue support.
 * This class implements the HandshakeState object as specified in Noise Protocol Framework §5.3. After the handshake completes, the sendCipher and receiveCipher
 * properties provide access to the encryption states for ongoing communication.
 *
 * @example Direct Handshake Usage
 * ```typescript
 * const handshake = new HandshakeState(true, psk, logger, prologue);
 *
 * // Write the first message with an optional payload.
 * const message = handshake.writeMessage(Buffer.from("client-hello"));
 *
 * // After the handshake completes, use the cipher states directly.
 * if (handshake.isComplete) {
 *   const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), data);
 * }
 * ```
 *
 * @example ESPHome Connection Pattern
 * ```typescript
 * // For ESPHome connections, use the specialized factory function which sets up
 * // the correct prologue automatically. ESPHome uses "NoiseAPIInit" as its prologue.
 * import { createESPHomeHandshake } from "./crypto-noise";
 *
 * const handshake = createESPHomeHandshake({
 *   role: "initiator",
 *   psk: Buffer.from(esphomeKey, "base64")
 * });
 *
 * // The handshake follows a strict two-message pattern.
 * const clientHello = handshake.writeMessage();
 * // Send to device and receive response...
 * handshake.readMessage(deviceResponse);
 *
 * // Now handshake.isComplete is true and cipher states are available.
 * ```
 */
export class HandshakeState {
    initiator;
    psk;
    log;
    // Cipher for sending encrypted messages after handshake.
    sendCipher;
    // Cipher for receiving encrypted messages after handshake.
    receiveCipher;
    // Whether the handshake has completed successfully.
    isComplete = false;
    // The symmetric state managing the handshake.
    ss;
    // Our ephemeral key pair.
    ephemeral;
    // The remote party's public key.
    remotePubKey;
    // Current position in the handshake pattern.
    patternIndex = 0;
    /**
     * Constructs a new handshake state for the NNpsk0 pattern.
     * @param initiator - True if we're the initiator, false if we're the responder.
     * @param psk - The 32-byte pre-shared key for authentication.
     * @param log - Optional Homebridge-compatible logger for debugging.
     * @param prologue - Optional fixed prologue bytes to mix into the handshake hash.
     * @throws {NoiseHandshakeError} If the PSK is not exactly 32 bytes.
     */
    constructor(initiator, psk, log, prologue = EMPTY_BUFFER) {
        this.initiator = initiator;
        this.psk = psk;
        this.log = log;
        // Validate PSK length.
        if (psk.length !== NOISE_PSK_LEN) {
            throw new NoiseHandshakeError("PSK must be exactly " + NOISE_PSK_LEN + " bytes, got " + psk.length, "INVALID_PSK_LENGTH");
        }
        this.ss = new SymmetricState(log);
        // Initialize the symmetric state to set up initial handshake hash and chaining key.
        this.ss.InitializeSymmetric();
        // Mix the prologue into the handshake hash before any messages to bind the handshake to pre-agreed context data.
        this.ss.MixHash(prologue);
        this.log?.debug("HandshakeState: Mixed prologue into initial hash: " + prologue.toString("hex") + ".");
        this.log?.debug("HandshakeState: Initialized as " + (initiator ? "initiator" : "responder") + ".");
    }
    /**
     * Gets the role of this party in the handshake.
     */
    get role() {
        return this.initiator ? "initiator" : "responder";
    }
    /**
     * Checks if this party can send encrypted messages (handshake complete and send cipher available).
     */
    get canSend() {
        return (this.sendCipher !== undefined) && this.sendCipher.HasKey();
    }
    /**
     * Checks if this party can receive encrypted messages (handshake complete and receive cipher available).
     */
    get canReceive() {
        return (this.receiveCipher !== undefined) && this.receiveCipher.HasKey();
    }
    /**
     * Ensures the handshake is still in progress (not yet complete).
     */
    ensureHandshakeInProgress() {
        if (this.patternIndex >= NNPSK0_PATTERN.length) {
            throw new NoiseHandshakeError("Handshake already complete", "HANDSHAKE_COMPLETE");
        }
    }
    /**
     * Ensures both ephemeral and remote public keys are available for DH operations.
     */
    ensureKeysForDH() {
        if (!this.ephemeral || !this.remotePubKey) {
            throw new NoiseHandshakeError("Missing keys for Diffie-Hellman operation", "MISSING_KEYS");
        }
    }
    /**
     * Processes a single token during message writing.
     */
    processWriteToken(token) {
        switch (token) {
            case "psk":
                this.log?.debug("HandshakeState: Mixing PSK into handshake state.");
                this.ss.MixKeyAndHash(this.psk);
                return EMPTY_BUFFER;
            case "e": {
                // Generate a new ephemeral key pair and send the public key.
                const { privateKey, publicKeyRaw } = generateX25519KeyPair();
                this.ephemeral = { privateKey, publicKeyRaw };
                // Mix the public key into the handshake state.
                this.ss.MixHash(publicKeyRaw);
                this.ss.MixKey(publicKeyRaw);
                this.log?.debug("HandshakeState: Sending ephemeral public key: " + publicKeyRaw.toString("hex") + ".");
                return publicKeyRaw;
            }
            case "ee": {
                this.ensureKeysForDH();
                if (!this.ephemeral || !this.remotePubKey) {
                    throw new NoiseHandshakeError("Keys not available after validation", "MISSING_KEYS");
                }
                // Compute the shared secret using X25519 and mix it into the handshake state.
                const dh = diffieHellman({ privateKey: this.ephemeral.privateKey, publicKey: this.remotePubKey });
                this.ss.MixKey(dh);
                this.log?.debug("HandshakeState: Processed ephemeral-ephemeral DH exchange.");
                return EMPTY_BUFFER;
            }
            default:
                throw new NoiseHandshakeError("Unsupported token: " + token, "UNSUPPORTED_TOKEN");
        }
    }
    /**
     * Processes a single token during message reading.
     */
    processReadToken(token, message, index) {
        switch (token) {
            case "psk":
                this.log?.debug("HandshakeState: Mixing PSK into handshake state.");
                this.ss.MixKeyAndHash(this.psk);
                return 0;
            case "e": {
                // Verify we actually have 32 bytes.
                if ((message.length - index) < DH_LEN) {
                    throw new NoiseHandshakeError("Truncated ephemeral key", "TRUNCATED_E");
                }
                // Read the remote ephemeral public key from the message.
                const remoteKeyRaw = message.subarray(index, index + DH_LEN);
                // Mix the remote public key into the handshake state.
                this.ss.MixHash(remoteKeyRaw);
                this.ss.MixKey(remoteKeyRaw);
                // Import the raw key as a KeyObject for DH operations.
                this.remotePubKey = importX25519PublicKey(remoteKeyRaw);
                this.log?.debug("HandshakeState: Received ephemeral public key: " + remoteKeyRaw.toString("hex") + ".");
                return DH_LEN;
            }
            case "ee": {
                this.ensureKeysForDH();
                if (!this.ephemeral || !this.remotePubKey) {
                    throw new NoiseHandshakeError("Keys not available after validation", "MISSING_KEYS");
                }
                // Compute the shared secret using X25519 and mix it into the handshake state.
                const dh = diffieHellman({ privateKey: this.ephemeral.privateKey, publicKey: this.remotePubKey });
                this.ss.MixKey(dh);
                this.log?.debug("HandshakeState: Processed ephemeral-ephemeral DH exchange.");
                return 0;
            }
            default:
                throw new NoiseHandshakeError("Unsupported token: " + token, "UNSUPPORTED_TOKEN");
        }
    }
    /**
     * Writes a handshake message according to the next pattern in the sequence.
     * @param payload - Optional payload data to encrypt and include in the message.
     * @returns The complete handshake message to send.
     * @throws {NoiseHandshakeError} If the handshake is already complete or if pattern processing fails.
     *
     * @example
     * ```typescript
     * try {
     *   const message1 = initiator.writeMessage();
     *   const message2 = initiator.writeMessage(Buffer.from("hello"));
     * } catch (error) {
     *   if (error instanceof NoiseHandshakeError) {
     *     console.error("Write failed:", error.message, "Code:", error.code);
     *   }
     * }
     * ```
     */
    writeMessage(payload = EMPTY_BUFFER) {
        this.ensureHandshakeInProgress();
        const pattern = NNPSK0_PATTERN[this.patternIndex++];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!pattern) {
            throw new NoiseHandshakeError("No pattern available to process", "NO_PATTERN");
        }
        // Collect message parts to minimize concatenation operations.
        const parts = [];
        // Process each token in the pattern and collect non-empty outputs.
        for (const token of pattern) {
            const tokenOutput = this.processWriteToken(token);
            if (tokenOutput.length > 0) {
                parts.push(tokenOutput);
            }
        }
        // Handle empty messages efficiently.
        if ((payload === EMPTY_BUFFER) && (parts.length === 0)) {
            return this.ss.EncryptAndHash(EMPTY_BUFFER);
        }
        // Encrypt and add the payload if present.
        const encPayload = this.ss.EncryptAndHash(payload);
        if (encPayload.length > 0) {
            parts.push(encPayload);
        }
        // Optimize for common cases to avoid unnecessary concatenation.
        const out = (parts.length === 0) ? EMPTY_BUFFER : ((parts.length === 1) ? parts[0] : Buffer.concat(parts));
        this.log?.debug("HandshakeState: Wrote message with " + payload.length + " byte payload.");
        // If this was the last message and we're the responder, split the state (responder splits after writing final message).
        if ((this.patternIndex >= NNPSK0_PATTERN.length) && !this.initiator) {
            const [c1, c2] = this.ss.Split();
            this.receiveCipher = c1;
            this.sendCipher = c2;
            this.isComplete = true;
            this.log?.debug("HandshakeState: Handshake complete (responder split on write).");
        }
        return out;
    }
    /**
     * Reads a handshake message according to the next pattern in the sequence.
     * @param message - The received handshake message to process.
     * @returns The decrypted payload from the message.
     * @throws {NoiseHandshakeError} If the handshake is already complete or authentication fails.
     *
     * @example
     * ```typescript
     * const payload = responder.readMessage(message1);
     * console.log("Received:", payload.toString());
     * ```
     */
    readMessage(message) {
        this.ensureHandshakeInProgress();
        const pattern = NNPSK0_PATTERN[this.patternIndex++];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!pattern) {
            throw new NoiseHandshakeError("No pattern available to process", "NO_PATTERN");
        }
        let index = 0;
        // Process each token in the pattern.
        for (const token of pattern) {
            const bytesConsumed = this.processReadToken(token, message, index);
            index += bytesConsumed;
        }
        // Decrypt the payload from the remainder of the message.
        const cipherPayload = message.subarray(index);
        const payload = this.ss.DecryptAndHash(cipherPayload);
        this.log?.debug("HandshakeState: Read message with " + payload.length + " byte payload.");
        // If this was the last message and we're the initiator, split the state (initiator splits after reading final message).
        if ((this.patternIndex >= NNPSK0_PATTERN.length) && this.initiator) {
            const [c1, c2] = this.ss.Split();
            this.sendCipher = c1;
            this.receiveCipher = c2;
            this.isComplete = true;
            this.log?.debug("HandshakeState: Handshake complete (initiator split on read).");
        }
        return payload;
    }
    /**
     * Clears sensitive key material from memory where possible.
     * Note: Cannot clear KeyObject internal memory in Node.js.
     *
     * @example
     * ```typescript
     * // Clean up after handshake
     * handshake.destroy();
     * ```
     */
    destroy() {
        // Clear sensitive key material from memory where possible.
        if (this.ephemeral) {
            this.ephemeral.publicKeyRaw.fill(0);
            // Note: Cannot clear KeyObject internal memory in Node.js.
        }
        // Reset state to prevent reuse.
        this.patternIndex = NNPSK0_PATTERN.length;
        this.isComplete = false;
        this.ephemeral = undefined;
        this.remotePubKey = undefined;
        this.sendCipher = undefined;
        this.receiveCipher = undefined;
    }
}
/**
 * Factory function to create a Noise handshake with a cleaner API. This is the primary way to create a handshake for general Noise protocol usage. For ESPHome specific
 * connections, use createESPHomeHandshake instead.
 *
 * @param options - Configuration options for the handshake.
 * @returns A configured HandshakeState instance ready for the handshake process.
 *
 * @example Standard Usage
 * ```typescript
 * import { createHandshake } from "./crypto-noise";
 *
 * const handshake = createHandshake({
 *   role: "initiator",
 *   psk: myPreSharedKey,
 *   prologue: Buffer.from("application-specific-data"),
 *   logger: myLogger
 * });
 *
 * // Perform the handshake and then use the cipher states.
 * const msg = handshake.writeMessage();
 * // ... exchange messages ...
 *
 * // After completion, encrypt data using the cipher states.
 * const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), plaintext);
 * ```
 *
 * @example Minimal Configuration
 * ```typescript
 * // The minimal configuration only requires a role and PSK.
 * const handshake = createHandshake({
 *   role: "responder",
 *   psk: sharedSecret
 * });
 * ```
 */
export function createHandshake(options) {
    return new HandshakeState(options.role === "initiator", options.psk, options.logger, options.prologue);
}
/**
 * Factory function to create a Noise handshake specifically for ESPHome connections.
 * This function automatically configures the correct prologue for ESPHome Native API communication.
 * ESPHome devices expect a specific prologue format and this function handles that setup automatically.
 *
 * @param options - Configuration options for the ESPHome handshake.
 * @returns A configured HandshakeState instance ready for ESPHome communication.
 *
 * @example Complete ESPHome Connection Flow
 * ```typescript
 * import { createESPHomeHandshake } from "./crypto-noise";
 * import { connect } from "node:net";
 *
 * // The PSK is configured in your ESPHome device YAML file. Look for the api.encryption.key field in your device configuration.
 * // api:
 * //   encryption:
 * //     key: "base64-encoded-32-byte-key"
 *
 * const psk = Buffer.from("your-base64-key", "base64");
 * const handshake = createESPHomeHandshake({
 *   role: "initiator",  // Clients connecting to ESPHome devices are always initiators.
 *   psk: psk
 * });
 *
 * // Connect to the ESPHome device on its API port (default 6053).
 * const socket = connect(6053, "device-ip-address");
 *
 * // Perform the two-message Noise handshake once connected.
 * socket.on("connect", () => {
 *   const clientHello = handshake.writeMessage();
 *   socket.write(clientHello);
 * });
 *
 * socket.on("data", (data) => {
 *   if (!handshake.isComplete) {
 *     // Complete the handshake by processing the device's response.
 *     handshake.readMessage(data);
 *     console.log("Handshake complete, ready for encrypted API communication.");
 *
 *     // Now you can send encrypted API messages using the established cipher states.
 *     const apiMessage = createConnectRequest(); // Your API message creation.
 *     const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), apiMessage);
 *     socket.write(encrypted);
 *   } else {
 *     // All subsequent communication is encrypted using the cipher states.
 *     const decrypted = handshake.receiveCipher.DecryptWithAd(Buffer.alloc(0), data);
 *     handleAPIResponse(decrypted); // Your API response handler.
 *   }
 * });
 * ```
 *
 * @example With Logging for Debugging
 * ```typescript
 * // Enable detailed logging to troubleshoot handshake issues.
 * const handshake = createESPHomeHandshake({
 *   role: "initiator",
 *   psk: myPSK,
 *   logger: {
 *     debug: (msg) => console.log("[DEBUG]", msg),
 *     error: (msg) => console.error("[ERROR]", msg)
 *   }
 * });
 *
 * // The logger will output detailed information about each handshake step,
 * // including key exchanges, hash updates, and cipher state transitions.
 * ```
 *
 * @example Implementing an ESPHome-Compatible Server
 * ```typescript
 * // If you're implementing a server that ESPHome devices can connect to,
 * // configure the handshake as a responder. This is uncommon but supported.
 * const handshake = createESPHomeHandshake({
 *   role: "responder",
 *   psk: serverPSK,
 *   additionalPrologueData: Buffer.from("server-identifier")
 * });
 *
 * // Wait for incoming connections and process the initiator's hello message.
 * server.on("connection", (socket) => {
 *   socket.on("data", (data) => {
 *     if (!handshake.isComplete) {
 *       // Read the client's hello message.
 *       handshake.readMessage(data);
 *
 *       // Send our response to complete the handshake.
 *       const response = handshake.writeMessage();
 *       socket.write(response);
 *     } else {
 *       // Handle encrypted API messages.
 *       const decrypted = handshake.receiveCipher.DecryptWithAd(Buffer.alloc(0), data);
 *       processIncomingMessage(decrypted);
 *     }
 *   });
 * });
 * ```
 *
 * @example Error Handling
 * ```typescript
 * try {
 *   const handshake = createESPHomeHandshake({
 *     role: "initiator",
 *     psk: psk
 *   });
 *
 *   // Process messages with proper error handling.
 *   handshake.readMessage(incomingData);
 * } catch (error) {
 *   if (error instanceof NoiseHandshakeError) {
 *     // Handle specific Noise protocol errors.
 *     console.error("Handshake failed:", error.message, "Code:", error.code);
 *
 *     // Common error codes include:
 *     // AUTH_FAILED - Authentication tag verification failed.
 *     // INVALID_PSK_LENGTH - PSK is not exactly 32 bytes.
 *     // HANDSHAKE_COMPLETE - Attempting operations after handshake finished.
 *     // MISSING_KEYS - Required keys not available for DH operation.
 *   }
 * }
 * ```
 */
export function createESPHomeHandshake(options) {
    options.role ??= "initiator";
    // ESPHome always uses "NoiseAPIInit" as the prologue prefix. Additional data can be appended if needed, but typically isn't used.
    let prologue = Buffer.from(ESPHOME_NOISE_PROLOGUE, "utf8");
    if (options.additionalPrologueData && (options.additionalPrologueData.length > 0)) {
        // Concatenate the ESPHome prologue with any additional data.
        prologue = Buffer.concat([prologue, options.additionalPrologueData]);
    }
    return new HandshakeState(options.role === "initiator", options.psk, options.logger, prologue);
}
//# sourceMappingURL=crypto-noise.js.map