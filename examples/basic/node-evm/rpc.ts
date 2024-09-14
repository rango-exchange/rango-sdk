import { MetaResponse, TransactionType } from "rango-sdk-basic";

export function getRpcUrlForBlockchain(meta: MetaResponse, blockchainName: string): string {
    const rpcUrl = meta
        .blockchains
        .filter(blockchain => blockchain.type === TransactionType.EVM)
        .find(blockchain => blockchain.name === blockchainName)
        ?.info.rpcUrls?.[0]
    if (!rpcUrl) {
        throw new Error(`There is no rpc url for blockchain ${blockchainName}`)
    }
    return rpcUrl
} 