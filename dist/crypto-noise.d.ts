/**
 * Node-native Noise_NNpsk0_25519_ChaChaPoly_SHA256 handshake implementation with no external dependencies.
 *
 * @module crypto-noise
 *
 * This module implements the Noise_NNpsk0_25519_ChaChaPoly_SHA256 handshake pattern with optional prologue support. The implementation only uses Node native
 * cryptographic primitives for X25519 key exchange operations and includes robust logging support. After completing the handshake, you'll have access to
 * cipher states for bidirectional encrypted communication.
 *
 * @example Basic Handshake and Encryption
 * ```typescript
 * import { createHandshake } from "./crypto-noise";
 * import { randomBytes } from "node:crypto";
 *
 * // Create a pre-shared key that both parties must possess. This must be exactly 32 bytes.
 * const psk = randomBytes(32);
 *
 * // Initialize the initiator and responder with their respective roles.
 * const initiator = createHandshake({ role: "initiator", psk });
 * const responder = createHandshake({ role: "responder", psk });
 *
 * // Perform the two-message handshake pattern. First, the initiator sends their ephemeral key.
 * const msg1 = initiator.writeMessage();
 * const payload1 = responder.readMessage(msg1);
 *
 * // Then the responder replies with their ephemeral key, completing the handshake.
 * const msg2 = responder.writeMessage();
 * const payload2 = initiator.readMessage(msg2);
 *
 * // After the handshake completes, both parties have cipher states for secure communication.
 * // The initiator uses sendCipher to encrypt and receiveCipher to decrypt.
 * const encrypted = initiator.sendCipher.EncryptWithAd(Buffer.alloc(0), Buffer.from("Hello World"));
 * const decrypted = responder.receiveCipher.DecryptWithAd(Buffer.alloc(0), encrypted);
 * console.log("Decrypted message:", decrypted.toString());
 *
 * // The responder can send messages back using their sendCipher.
 * const response = responder.sendCipher.EncryptWithAd(Buffer.alloc(0), Buffer.from("Hello back!"));
 * const responseDecrypted = initiator.receiveCipher.DecryptWithAd(Buffer.alloc(0), response);
 * ```
 *
 * @example ESPHome Device Connection
 * ```typescript
 * import { createESPHomeHandshake } from "./crypto-noise";
 * import { connect } from "node:net";
 *
 * // Connect to an ESPHome device using its pre-shared key from the YAML configuration.
 * // The PSK is configured in your device's YAML under api.encryption.key.
 * const handshake = createESPHomeHandshake({
 *   role: "initiator",  // Clients are always initiators when connecting to ESPHome devices.
 *   psk: Buffer.from("your-32-byte-psk-from-esphome-config", "base64"),
 *   logger: myLogger
 * });
 *
 * // Connect to the device on port 6053, which is the standard ESPHome API port.
 * const socket = connect(6053, "192.168.1.100");
 *
 * socket.on("connect", () => {
 *   // Send the first handshake message containing our ephemeral public key.
 *   const hello = handshake.writeMessage();
 *   socket.write(hello);
 * });
 *
 * socket.on("data", (data) => {
 *   if (!handshake.isComplete) {
 *     // Process the device's handshake response.
 *     handshake.readMessage(data);
 *
 *     // The handshake is now complete. We can use the cipher states for API communication.
 *     // All subsequent API messages must be encrypted using these cipher states.
 *     const apiHello = createAPIHelloMessage(); // Your API protocol implementation.
 *     const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), apiHello);
 *     socket.write(encrypted);
 *   } else {
 *     // Decrypt incoming API messages from the device.
 *     const plaintext = handshake.receiveCipher.DecryptWithAd(Buffer.alloc(0), data);
 *     processAPIMessage(plaintext); // Your API message handler.
 *   }
 * });
 * ```
 *
 * @example Using Associated Data for Message Authentication
 * ```typescript
 * // You can include associated data that gets authenticated but not encrypted.
 * // This is useful for message sequence numbers or protocol headers.
 * const sequenceNumber = Buffer.allocUnsafe(4);
 * sequenceNumber.writeUInt32LE(messageCount++, 0);
 *
 * // The associated data is authenticated but transmitted in plaintext.
 * const encrypted = handshake.sendCipher.EncryptWithAd(sequenceNumber, payload);
 *
 * // The receiver must provide the same associated data to decrypt successfully.
 * const decrypted = handshake.receiveCipher.DecryptWithAd(sequenceNumber, encrypted);
 * ```
 */
import type { EspHomeLogging, Nullable } from "./types.js";
import { Buffer } from "node:buffer";
/**
 * Maximum Noise protocol message length as specified in the Noise Protocol Framework.
 */
export declare const NOISE_MAX_MESSAGE_LEN = 65535;
/**
 * Required length for pre-shared keys in bytes.
 */
export declare const NOISE_PSK_LEN = 32;
/**
 * Length of Diffie-Hellman public keys in bytes.
 */
export declare const NOISE_DH_LEN = 32;
/**
 * ESPHome Noise protocol prologue prefix used for all ESPHome API connections. This identifies the connection as using the ESPHome Native API protocol.
 */
export declare const ESPHOME_NOISE_PROLOGUE = "NoiseAPIInit\0\0";
/**
 * Role in the Noise protocol handshake.
 */
export type NoiseRole = "initiator" | "responder";
/**
 * Options for creating a Noise handshake.
 */
export interface NoiseHandshakeOptions {
    /** The role this party plays in the handshake. */
    role: NoiseRole;
    /** The 32-byte pre-shared key for authentication. */
    psk: Buffer;
    /** Optional prologue data to bind to the handshake. */
    prologue?: Buffer;
    /** Optional logger for debugging output. */
    logger?: EspHomeLogging;
}
/**
 * Options for creating an ESPHome Noise handshake.
 * This is a specialized version for connecting to ESPHome devices.
 */
export interface ESPHomeHandshakeOptions {
    /** The role in the handshake (defaults to "initiator" for clients). */
    role?: "initiator" | "responder";
    /** The 32-byte pre-shared key configured in the ESPHome device. */
    psk: Buffer;
    /** Optional additional data to append to the ESPHome prologue. */
    additionalPrologueData?: Buffer;
    /** Optional logger for debugging output. */
    logger?: EspHomeLogging;
}
/**
 * Noise handshake error codes to allow precise error handling by consumers.
 */
export type NoiseHandshakeErrorCode = "AUTH_FAILED" | "CT_TOO_SHORT" | "HANDSHAKE_COMPLETE" | "INVALID_PSK_LENGTH" | "MISSING_KEYS" | "MSG_TOO_LONG" | "NO_PATTERN" | "NOT_INITIALIZED" | "TRUNCATED_E" | "UNSUPPORTED_TOKEN";
/**
 * Custom error class for Noise protocol errors with error codes for better error handling.
 */
export declare class NoiseHandshakeError extends Error {
    readonly code: string;
    /**
     * Creates a new NoiseHandshakeError.
     * @param message - The error message.
     * @param code - A machine-readable error code.
     */
    constructor(message: string, code: string);
}
/**
 * CipherState manages the encryption state for a single direction of communication.
 * Implements the CipherState object as specified in Noise Protocol Framework §5.1 using ChaCha20-Poly1305.
 */
export declare class CipherState {
    private readonly log?;
    private k;
    private n;
    private readonly nonce;
    constructor(log?: EspHomeLogging | undefined);
    /**
     * Initializes the cipher state with a new key, resetting the nonce counter to zero.
     */
    InitializeKey(key: Nullable<Buffer>): void;
    /**
     * Checks whether this cipher state has an encryption key set.
     */
    HasKey(): boolean;
    /**
     * Updates the reusable nonce buffer with the current counter value in little-endian format at offset 4.
     */
    private updateNonce;
    /**
     * Encrypts plaintext with associated data using ChaCha20-Poly1305. Returns plaintext unchanged if no key is set.
     */
    EncryptWithAd(ad: Buffer, plaintext: Buffer): Buffer;
    /**
     * Decrypts ciphertext with associated data using ChaCha20-Poly1305. Returns input unchanged if no key is set.
     */
    DecryptWithAd(ad: Buffer, data: Buffer): Buffer;
    /**
     * Rekeys the cipher state by encrypting zeros with the maximum nonce value, providing forward secrecy.
     */
    Rekey(): void;
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
export declare class HandshakeState {
    private readonly initiator;
    private readonly psk;
    private readonly log?;
    sendCipher?: CipherState;
    receiveCipher?: CipherState;
    isComplete: boolean;
    private ss;
    private ephemeral?;
    private remotePubKey?;
    private patternIndex;
    /**
     * Constructs a new handshake state for the NNpsk0 pattern.
     * @param initiator - True if we're the initiator, false if we're the responder.
     * @param psk - The 32-byte pre-shared key for authentication.
     * @param log - Optional Homebridge-compatible logger for debugging.
     * @param prologue - Optional fixed prologue bytes to mix into the handshake hash.
     * @throws {NoiseHandshakeError} If the PSK is not exactly 32 bytes.
     */
    constructor(initiator: boolean, psk: Buffer, log?: EspHomeLogging | undefined, prologue?: Buffer);
    /**
     * Gets the role of this party in the handshake.
     */
    get role(): NoiseRole;
    /**
     * Checks if this party can send encrypted messages (handshake complete and send cipher available).
     */
    get canSend(): boolean;
    /**
     * Checks if this party can receive encrypted messages (handshake complete and receive cipher available).
     */
    get canReceive(): boolean;
    /**
     * Ensures the handshake is still in progress (not yet complete).
     */
    private ensureHandshakeInProgress;
    /**
     * Ensures both ephemeral and remote public keys are available for DH operations.
     */
    private ensureKeysForDH;
    /**
     * Processes a single token during message writing.
     */
    private processWriteToken;
    /**
     * Processes a single token during message reading.
     */
    private processReadToken;
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
    writeMessage(payload?: Buffer): Buffer;
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
    readMessage(message: Buffer): Buffer;
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
    destroy(): void;
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
export declare function createHandshake(options: NoiseHandshakeOptions): HandshakeState;
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
export declare function createESPHomeHandshake(options: ESPHomeHandshakeOptions): HandshakeState;
