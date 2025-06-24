package com.infernokun.infernoComics.utils;

import com.infernokun.infernoComics.config.InfernoComicsConfig;
import com.infernokun.infernoComics.exceptions.CryptoException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.spec.KeySpec;
import java.util.Base64;

@Slf4j
@Component
@RequiredArgsConstructor
public class AESUtil {
    private static final String ALGORITHM = "AES";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128;
    private static final int IV_LENGTH = 12;
    private static final int SALT_LENGTH = 16; // Length of the salt in bytes
    private static final String SECRET_KEY_ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final int PBKDF2_ITERATIONS = 65536;

    private final InfernoComicsConfig amaterasuConfig;

    /** Derives a 16-byte AES key from the encryption key stored in the config using PBKDF2. */
    private byte[] deriveKey(byte[] salt) {
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance(SECRET_KEY_ALGORITHM);
            KeySpec spec =
                    new PBEKeySpec(
                            amaterasuConfig.getEncryptionKey().toCharArray(),
                            salt,
                            PBKDF2_ITERATIONS,
                            128); // AES-128 key length
            SecretKey tmp = factory.generateSecret(spec);
            SecretKey secretKey = new SecretKeySpec(tmp.getEncoded(), ALGORITHM);

            log.debug("Derived key (bytes): {}", bytesToHex(secretKey.getEncoded())); // Log derived key

            return secretKey.getEncoded();
        } catch (Exception e) {
            log.error("Key derivation failed!", e);
            throw new CryptoException("Key derivation failed!", e);
        }
    }

    /** Encrypts a given string using AES-GCM. */
    public String encrypt(String encryptedValue) {
        try {

            if (encryptedValue == null) {
                log.warn("Attempted to decrypt null value");
                return null; // or throw a specific exception
            }

            // Generate a random salt
            byte[] salt = new byte[SALT_LENGTH];
            SecureRandom random = new SecureRandom();
            random.nextBytes(salt);

            byte[] key = deriveKey(salt);
            byte[] iv = new byte[IV_LENGTH];
            random.nextBytes(iv); // Generate a random IV

            SecretKeySpec secretKey = new SecretKeySpec(key, ALGORITHM);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] encrypted = cipher.doFinal(encryptedValue.getBytes(StandardCharsets.UTF_8));

            // Concatenate salt, IV, and encrypted data
            byte[] combined = new byte[SALT_LENGTH + IV_LENGTH + encrypted.length];
            System.arraycopy(salt, 0, combined, 0, SALT_LENGTH);
            System.arraycopy(iv, 0, combined, SALT_LENGTH, IV_LENGTH);
            System.arraycopy(encrypted, 0, combined, SALT_LENGTH + IV_LENGTH, encrypted.length);

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            log.error("Encryption failed: " + e.getMessage(), e);
            throw new CryptoException("Encryption failed: " + e.getMessage(), e);
        }
    }

    /** Decrypts a given AES-GCM encrypted string. */
    public String decrypt(String encryptedValue) {
        try {
            byte[] decoded = Base64.getDecoder().decode(encryptedValue);

            if (decoded.length < SALT_LENGTH + IV_LENGTH) {
                throw new CryptoException("Invalid encrypted data: Too short!");
            }

            // Extract salt, IV, and encrypted data
            byte[] salt = new byte[SALT_LENGTH];
            byte[] iv = new byte[IV_LENGTH];
            byte[] encryptedData = new byte[decoded.length - SALT_LENGTH - IV_LENGTH];

            System.arraycopy(decoded, 0, salt, 0, SALT_LENGTH);
            System.arraycopy(decoded, SALT_LENGTH, iv, 0, IV_LENGTH);
            System.arraycopy(decoded, SALT_LENGTH + IV_LENGTH, encryptedData, 0, encryptedData.length);

            log.debug("Salt (bytes): {}", bytesToHex(salt));
            log.debug("IV (bytes): {}", bytesToHex(iv));
            log.debug("Encrypted data (bytes): {}", bytesToHex(encryptedData));

            byte[] key = deriveKey(salt);
            SecretKeySpec secretKey = new SecretKeySpec(key, ALGORITHM);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH, iv));

            byte[] decrypted = cipher.doFinal(encryptedData);
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("Decryption failed: {}", e.getMessage());
            throw new CryptoException("Decryption failed: " + e.getMessage());
        }
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}