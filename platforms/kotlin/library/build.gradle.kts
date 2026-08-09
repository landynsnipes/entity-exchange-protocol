plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "org.entityexchange.wallet"
    compileSdk = 35
    defaultConfig { minSdk = 28 }
}

kotlin { jvmToolchain(17) }
