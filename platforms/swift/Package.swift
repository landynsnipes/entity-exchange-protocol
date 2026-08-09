// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "EXPWalletPlatform",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "EXPWalletPlatform", targets: ["EXPWalletPlatform"])],
    targets: [
        .target(name: "EXPWalletPlatform"),
        .testTarget(name: "EXPWalletPlatformTests", dependencies: ["EXPWalletPlatform"])
    ]
)
