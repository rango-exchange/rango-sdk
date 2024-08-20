import { SwapResult, MetaResponse, MultiRouteResponse, Token, TransactionStatusResponse, ConfirmRouteResponse, TransactionStatus } from 'rango-sdk'


export function logMeta(meta: MetaResponse) {
    const { tokens, blockchains } = meta
    console.log(`- fetched ${tokens.length} tokens and ${blockchains.length} blockchains`)
}

export function logSelectedTokens(sourceToken: Token, targetToken: Token) {
    console.log(`- user selects to swap ${sourceToken.blockchain}.${sourceToken.symbol} to ${targetToken.blockchain}.${targetToken.symbol}`)
}

export function logRoutes(routingResponse: MultiRouteResponse) {
    const routes = routingResponse.results
    if (routes.length > 0) {
        console.log(`- found ${routes.length} routes:`)
        for (const route of routes) {
            console.log(`   - route: ${route.swaps.map(swap => swap.swapperId).join(' -> ')}`)
            console.log(`       - result type: ${route.resultType}`)
            console.log(`       - output: ${route.outputAmount} ${route.swaps[route.swaps.length - 1].to.symbol}`)
            console.log(`       - tags: ${route.tags.map(tag => tag.label).join(', ') || '-'}`)
        }
    } else {
        console.log(`There was no route! ${routingResponse.error}`)
    }
}

export function logConfirmedRoute(response: ConfirmRouteResponse['result']) {
    const route = response?.result!
    console.log(`- confirmed route: ${route.swaps.map(swap => swap.swapperId).join(' -> ')}`)
    console.log(`  - request id: ${response?.requestId}`)
    console.log(`  - result type: ${route.resultType}`)
    console.log(`  - output: ${route.outputAmount} ${route.swaps[route.swaps.length - 1].to.symbol}`)
    console.log(`  - balance validations:`)
    for (const validation of response?.validationStatus || []) {
        console.log(`    - ${validation.blockchain}:`)
        for (const wallet of validation.wallets) {
            for (const asset of wallet.requiredAssets) {
                console.log(`      - asset: ${asset.asset.symbol}, reason: ${asset.reason}, required balance: ${asset.requiredAmount.amount}, current balance: ${asset.currentAmount.amount}, ok? ${asset.ok}`)
            }
        }
    }
}


export function logRouteStep(swap: SwapResult, step: number) {
    console.log(`- executing step #${step} from: ${swap.fromAmount} ${swap.from.blockchain}-${swap.from.symbol} to ${swap.toAmount} ${swap.to.blockchain}-${swap.to.symbol} via ${swap.swapperId}`)
}


export function logWallet(address: string) {
    console.log(`- connected to walelt address: ${address}`)
}

export function logStepStatus(state: TransactionStatusResponse) {
    const { status } = state
    console.log(`   - transaction status: ${status}`)
    if (status === TransactionStatus.SUCCESS) {
        console.log(`   - Hooray! Swap step succeeds!`)
    } else if (status === TransactionStatus.FAILED) {
        console.log(`   - Swap failed!`)
    }
    if (status && [TransactionStatus.SUCCESS, TransactionStatus.FAILED].includes(status)) {
        console.log(`       - Output token: ${state.outputToken?.blockchain}.${state.outputToken?.symbol}`)
        console.log(`       - Output token type: ${state.outputType}`)
        console.log(`       - Output token amount: ${state.outputAmount}`)
        for (const data of state.explorerUrl || []) {
            console.log(`       - ${data.description}: ${data.url}`)
        }
    }
}

export function logTransactionHash(hash: string, isApproval: boolean) {
    if (isApproval) {
        console.log(`   - approve transaction hash: ${hash}`)
    } else {
        console.log(`   - main transaction hash: ${hash}`)
    }
}

export function logApprovalResponse(isApproved: boolean) {
    console.log(`   - does user have enough approve amount? ${isApproved}`)
}