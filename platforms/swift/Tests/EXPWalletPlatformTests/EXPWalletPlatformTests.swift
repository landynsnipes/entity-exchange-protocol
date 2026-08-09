import XCTest
@testable import EXPWalletPlatform

final class EXPWalletPlatformTests: XCTestCase {
    func testRejectsExternalHTTP() async {
        let transport = EXPURLSessionTransport()
        do {
            _ = try await transport.send(url: URL(string: "http://example.com")!, method: "GET")
            XCTFail("Expected insecure transport rejection")
        } catch EXPPlatformError.insecureTransport { }
        catch { XCTFail("Unexpected error: \(error)") }
    }
}
