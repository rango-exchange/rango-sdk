import { MetaResponse, QuoteResponse, RoutingResultType, StatusResponse, SwapResponse, Token, TransactionStatus, TransactionType } from "rango-sdk-basic"

export function logMeta(meta: MetaResponse) {
    const { tokens, blockchains } = meta
    console.log(`- fetched ${tokens.length} tokens and ${blockchains.length} blockchains`)
}

export function logSelectedTokens(sourceToken: Token, targetToken: Token) {
    console.log(`- user selects to swap ${sourceToken.blockchain}.${sourceToken.symbol} to ${targetToken.blockchain}.${targetToken.symbol}`)
}

export function logQuote(quote: QuoteResponse) {
    const route = quote.route
    if (route && quote.resultType === RoutingResultType.OK) {
        console.log(`- found a quote via ${route.swapper.title}`)
        console.log(`   - result type: ${quote.resultType}`)
        console.log(`   - output: ${route.outputAmount} ${route.to.symbol} equals to $${route.outputAmountUsd}`)
        console.log(`   - fee: $${route.feeUsd}`)
        console.log(`   - estimated time: ${route.estimatedTimeInSeconds}s`)
    } else {
        console.log(`There was no route! ${quote.error} ${quote.resultType}`)
    }
}

export function logWallet(address: string) {
    console.log(`- connected to walelt address: ${address}`)
}

export function logSwap(swap: SwapResponse) {
    const { error, tx } = swap
    if (tx) {
        console.log(`- transaction created successfully.`)
        const tx = swap.tx
        if (tx?.type === TransactionType.EVM) {
            if (tx.approveData && tx.approveTo) {
                console.log(`- user doesn't have enough approval`)
                console.log(`- signing the approve transaction ...`)
            } else {
                console.log(`- user has enough approval`)
                console.log(`- signing the main transaction ...`)
            }
        }
    } else {
        console.log(`- error creating the transaction, ${error}`)
    }
}

export function logSwapStatus(state: StatusResponse) {
    const { status, bridgeData } = state
    console.log(`- transaction status: ${status}`)
    if (status === TransactionStatus.SUCCESS) {
        console.log(`- Hooray! Swap succeeds!`)
    } else if (status === TransactionStatus.FAILED) {
        console.log(`- Swap failed!`)
    }
    if (status && [TransactionStatus.SUCCESS, TransactionStatus.FAILED].includes(status)) {
        console.log(`   - Output token: ${state.output?.receivedToken.blockchain}.${state.output?.receivedToken.symbol}`)
        console.log(`   - Output token type: ${state.output?.type}`)
        console.log(`   - Output token amount: ${state.output?.amount}`)
        console.log(`   - Inbound transaction hash: ${bridgeData?.srcTxHash}`)
        console.log(`   - Outbound transaction hash: ${bridgeData?.destTxHash}`)
    }
}

export function logTransactionHash(hash: string, isApproval: boolean) {
    if (isApproval) {
        console.log(`- sending approve transaction: ${hash}`)
    } else {
        console.log(`- sending main transaction: ${hash}`)
    }
}

export function logApprovalResponse(isApproved: boolean) {
    console.log(`- does user have enough approve amount? ${isApproved}`)
}