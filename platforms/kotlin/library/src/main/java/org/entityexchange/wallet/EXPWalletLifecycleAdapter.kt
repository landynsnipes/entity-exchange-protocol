package org.entityexchange.wallet

import java.time.Instant

/**
 * Platform lifecycle seam for mobile EXP wallets.
 *
 * Android implementations provide deep links and wakeup scheduling through the host application.
 * This interface does not claim that background delivery or approval UI is available.
 */
interface EXPWalletLifecycleAdapter {
    fun openExternal(uri: String)

    fun registerDeepLink(handler: suspend (String) -> Unit): () -> Unit

    fun scheduleGatewayWakeup(authorizationId: String, notAfter: Instant)
}
