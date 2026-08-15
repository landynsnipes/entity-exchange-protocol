package org.entityexchange.wallet

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.util.Base64

sealed class EXPPlatformException(message: String, cause: Throwable? = null) : Exception(message, cause) {
    class UnsupportedSecureEd25519(cause: Throwable? = null) : EXPPlatformException("Secure Ed25519 is unavailable on this device.", cause)
    class MissingKey(alias: String) : EXPPlatformException("EXP wallet key is missing: $alias")
    class InvalidPublicKeyEncoding(alias: String) : EXPPlatformException("Ed25519 public key encoding is invalid: $alias")
    class UnsupportedKeyAlgorithm(alias: String) : EXPPlatformException("Key is not Ed25519: $alias")
}

data class EXPKeyCapability(val algorithm: String, val hardwareBacked: Boolean)

/** Android Keystore adapter. Capability detection fails closed when the provider lacks Ed25519. */
class AndroidKeystoreEd25519Signer(private val alias: String) {
    private val store: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun createIfMissing(): EXPKeyCapability {
        if (!store.containsAlias(alias)) {
            try {
                val generator = KeyPairGenerator.getInstance("Ed25519", "AndroidKeyStore")
                val specification = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                    .setUserAuthenticationRequired(false)
                    .build()
                generator.initialize(specification)
                generator.generateKeyPair()
            } catch (error: Exception) {
                throw EXPPlatformException.UnsupportedSecureEd25519(error)
            }
        }
        return capability()
    }

    /** Returns the SPKI DER representation used by Android's certificate API. */
    fun publicKeySpkiDer(): ByteArray = store.getCertificate(alias)?.publicKey?.encoded
        ?: throw EXPPlatformException.MissingKey(alias)

    /** Returns the 32-byte raw Ed25519 public key expected by wallet platform adapters. */
    fun publicKeyRaw(): ByteArray {
        val encoded = publicKeySpkiDer()
        val prefix = byteArrayOf(
            0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
            0x70, 0x03, 0x21, 0x00,
        )
        if (encoded.size != prefix.size + 32 || !encoded.copyOf(prefix.size).contentEquals(prefix)) {
            throw EXPPlatformException.InvalidPublicKeyEncoding(alias)
        }
        return encoded.copyOfRange(prefix.size, encoded.size)
    }

    fun sign(canonicalPayload: ByteArray): String {
        val key = store.getKey(alias, null) ?: throw EXPPlatformException.MissingKey(alias)
        val signature = Signature.getInstance("Ed25519")
        signature.initSign(key as java.security.PrivateKey)
        signature.update(canonicalPayload)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign())
    }

    fun delete() { store.deleteEntry(alias) }

    private fun capability(): EXPKeyCapability {
        val key = store.getKey(alias, null) as? java.security.PrivateKey ?: throw EXPPlatformException.MissingKey(alias)
        if (key.algorithm != "Ed25519") throw EXPPlatformException.UnsupportedKeyAlgorithm(alias)
        val factory = KeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
        val info = factory.getKeySpec(key, KeyInfo::class.java)
        return EXPKeyCapability(algorithm = key.algorithm, hardwareBacked = info.isInsideSecureHardware)
    }
}
