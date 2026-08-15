import XCTest
@testable import EXPWalletPlatform

final class EXPWalletPlatformTests: XCTestCase {
    func testWalletKeyUsesRawEd25519Encoding() async throws {
        let signer = EXPKeychainEd25519Signer(keyId: "exp-portability-test-\(UUID().uuidString)")
        try await signer.createIfMissing()
        let publicKey = try await signer.publicKey()
        XCTAssertEqual(publicKey.count, 32)
        let signature = try await signer.sign(canonicalPayload: Data("EXP".utf8))
        XCTAssertGreaterThan(signature.count, 80)
        try await signer.delete()
    }

    func testRejectsExternalHTTP() async {
        let transport = EXPURLSessionTransport()
        do {
            _ = try await transport.send(url: URL(string: "http://example.com")!, method: "GET")
            XCTFail("Expected insecure transport rejection")
        } catch EXPPlatformError.insecureTransport { }
        catch { XCTFail("Unexpected error: \(error)") }
    }
}
