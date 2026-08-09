import CryptoKit
import Foundation
import Security

public enum EXPPlatformError: Error, Equatable {
    case insecureTransport
    case keychainFailure(OSStatus)
    case invalidKeyMaterial
    case requestFailed(Int)
}

public struct EXPHTTPResult: Sendable {
    public let status: Int
    public let body: Data
}

public actor EXPKeychainEd25519Signer {
    public let keyId: String
    private let service: String

    public init(keyId: String, service: String = "org.entity-exchange.wallet") {
        self.keyId = keyId
        self.service = service
    }

    public func createIfMissing() throws {
        if try load() != nil { return }
        let key = Curve25519.Signing.PrivateKey()
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: keyId,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecValueData as String: key.rawRepresentation
        ]
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess || status == errSecDuplicateItem else {
            throw EXPPlatformError.keychainFailure(status)
        }
    }

    public func publicKey() throws -> Data {
        guard let privateKey = try load() else { throw EXPPlatformError.invalidKeyMaterial }
        return privateKey.publicKey.rawRepresentation
    }

    public func sign(canonicalPayload: Data) throws -> String {
        guard let privateKey = try load() else { throw EXPPlatformError.invalidKeyMaterial }
        return try privateKey.signature(for: canonicalPayload).base64URLEncodedString()
    }

    public func delete() throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: keyId]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw EXPPlatformError.keychainFailure(status)
        }
    }

    private func load() throws -> Curve25519.Signing.PrivateKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: keyId,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw EXPPlatformError.keychainFailure(status)
        }
        do { return try Curve25519.Signing.PrivateKey(rawRepresentation: data) }
        catch { throw EXPPlatformError.invalidKeyMaterial }
    }
}

public struct EXPURLSessionTransport: Sendable {
    public let timeout: TimeInterval
    public let allowLoopbackHTTPForProof: Bool

    public init(timeout: TimeInterval = 5, allowLoopbackHTTPForProof: Bool = false) {
        self.timeout = timeout
        self.allowLoopbackHTTPForProof = allowLoopbackHTTPForProof
    }

    public func send(url: URL, method: String, body: Data? = nil) async throws -> EXPHTTPResult {
        let loopback = url.host == "localhost" || url.host == "127.0.0.1" || url.host == "::1"
        guard url.scheme == "https" || (allowLoopbackHTTPForProof && loopback) else {
            throw EXPPlatformError.insecureTransport
        }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method
        request.httpBody = body
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw EXPPlatformError.requestFailed(0) }
        return EXPHTTPResult(status: http.statusCode, body: data)
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
