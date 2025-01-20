import uuid from 'uuid-random'
import {
  MetaRequest,
  MetaResponse,
  BestRouteRequest,
  BestRouteResponse,
  CheckApprovalResponse,
  CheckTxStatusRequest,
  TransactionStatusResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  ReportTransactionRequest,
  WalletDetailsResponse,
  RequestOptions,
  BlockchainMeta,
  CompactMetaResponse,
  CompactToken,
  Token,
  MultiRouteRequest,
  MultiRouteResponse,
  ConfirmRouteResponse,
  ConfirmRouteRequest,
  CustomTokenRequest,
  CustomTokenResponse,
  TokenBalanceResponse,
  TokenBalanceRequest,
  SwapperMetaExtended,
  MultipleTokenBalanceRequest,
  MultipleTokenBalanceResponse,
} from '../types'
import axios, { AxiosInstance } from 'axios'

type WalletAddresses = { blockchain: string; address: string }[]

export class RangoClient {
  private readonly deviceId: string
  private readonly apiKey: string
  private readonly apiUrl: string
  private readonly httpService: AxiosInstance

  constructor(apiKey: string, apiUrl?: string) {
    this.apiUrl = apiUrl || 'https://api.rango.exchange'
    this.apiKey = apiKey
    try {
      if (typeof window !== 'undefined') {
        const deviceId = localStorage.getItem('deviceId')
        if (deviceId) {
          this.deviceId = deviceId
        } else {
          const generatedId = uuid()
          localStorage.setItem('deviceId', generatedId)
          this.deviceId = generatedId
        }
      } else {
        this.deviceId = uuid()
      }
    } catch (e) {
      this.deviceId = uuid()
    }
    this.httpService = axios.create({
      baseURL: this.apiUrl,
    })
  }

  public async getAllMetadata(
    metaRequest?: MetaRequest,
    options?: RequestOptions
  ): Promise<MetaResponse> {
    const params = {
      ...metaRequest,
      blockchains: metaRequest?.blockchains?.join(),
      swappers: metaRequest?.swappers?.join(),
      swappersGroups: metaRequest?.swappersGroups?.join(),
      transactionTypes: metaRequest?.transactionTypes?.join(),
    }
    const axiosResponse = await this.httpService.get<CompactMetaResponse>(
      `/meta/compact?apiKey=${this.apiKey}`,
      {
        params,
        ...options,
      }
    )
    const reformatTokens = (tokens: CompactToken[]): Token[] =>
      tokens.map((tm) => ({
        blockchain: tm.b,
        symbol: tm.s,
        image: tm.i,
        address: tm.a || null,
        usdPrice: tm.p || null,
        isSecondaryCoin: tm.is || false,
        coinSource: tm.c || null,
        coinSourceUrl: tm.cu || null,
        name: tm.n || null,
        decimals: tm.d,
        isPopular: tm.ip || false,
        supportedSwappers: tm.ss || [],
      }))

    const tokens = reformatTokens(axiosResponse.data.tokens)
    const popularTokens = reformatTokens(axiosResponse.data.popularTokens)
    return { ...axiosResponse.data, tokens, popularTokens }
  }

  public async getBlockchains(
    options?: RequestOptions
  ): Promise<BlockchainMeta[]> {
    const axiosResponse = await this.httpService.get<BlockchainMeta[]>(
      `/meta/blockchains?apiKey=${this.apiKey}`,
      { ...options }
    )
    return axiosResponse.data
  }

  public async getSwappers(
    options?: RequestOptions
  ): Promise<SwapperMetaExtended[]> {
    const axiosResponse = await this.httpService.get<SwapperMetaExtended[]>(
      `/meta/swappers?apiKey=${this.apiKey}`,
      { ...options }
    )
    return axiosResponse.data
  }

  public async getCustomToken(
    customTokenRequest?: CustomTokenRequest,
    options?: RequestOptions
  ): Promise<CustomTokenResponse> {
    const axiosResponse = await this.httpService.get<CustomTokenResponse>(
      `/meta/custom-token?apiKey=${this.apiKey}`,
      { params: customTokenRequest, ...options }
    )
    return axiosResponse.data
  }

  public async getBestRoute(
    requestBody: BestRouteRequest,
    options?: RequestOptions
  ): Promise<BestRouteResponse> {
    const axiosResponse = await this.httpService.post<BestRouteResponse>(
      `/routing/best?apiKey=${this.apiKey}`,
      requestBody,
      { headers: { 'X-Rango-Id': this.deviceId }, ...options }
    )
    return axiosResponse.data
  }

  public async getAllRoutes(
    requestBody: MultiRouteRequest,
    options?: RequestOptions
  ): Promise<MultiRouteResponse> {
    const axiosResponse = await this.httpService.post<MultiRouteResponse>(
      `/routing/bests?apiKey=${this.apiKey}`,
      requestBody,
      { headers: { 'X-Rango-Id': this.deviceId }, ...options }
    )
    return axiosResponse.data
  }

  public async confirmRoute(
    requestBody: ConfirmRouteRequest,
    options?: RequestOptions
  ): Promise<ConfirmRouteResponse> {
    const axiosResponse = await this.httpService.post<ConfirmRouteResponse>(
      `/routing/confirm?apiKey=${this.apiKey}`,
      requestBody,
      { headers: { 'X-Rango-Id': this.deviceId }, ...options }
    )
    return axiosResponse.data
  }

  // @deprecated use confirmRoute instead
  public async confirmRouteRequest(
    requestBody: ConfirmRouteRequest,
    options?: RequestOptions
  ): Promise<ConfirmRouteResponse> {
    const axiosResponse = await this.httpService.post<ConfirmRouteResponse>(
      `/routing/confirm?apiKey=${this.apiKey}`,
      requestBody,
      { headers: { 'X-Rango-Id': this.deviceId }, ...options }
    )
    return axiosResponse.data
  }

  public async checkApproval(
    requestId: string,
    txId?: string,
    options?: RequestOptions
  ): Promise<CheckApprovalResponse> {
    const axiosResponse = await this.httpService.get<CheckApprovalResponse>(
      `/tx/${requestId}/check-approval?apiKey=${this.apiKey}`,
      { params: { txId }, ...options }
    )
    return axiosResponse.data
  }

  public async checkStatus(
    requestBody: CheckTxStatusRequest,
    options?: RequestOptions
  ): Promise<TransactionStatusResponse> {
    const axiosResponse =
      await this.httpService.post<TransactionStatusResponse>(
        `/tx/check-status?apiKey=${this.apiKey}`,
        requestBody,
        { ...options }
      )
    return axiosResponse.data
  }

  public async createTransaction(
    requestBody: CreateTransactionRequest,
    options?: RequestOptions
  ): Promise<CreateTransactionResponse> {
    const axiosResponse =
      await this.httpService.post<CreateTransactionResponse>(
        `/tx/create?apiKey=${this.apiKey}`,
        requestBody,
        { ...options }
      )
    return axiosResponse.data
  }

  public async reportFailure(
    requestBody: ReportTransactionRequest,
    options?: RequestOptions
  ): Promise<void> {
    await this.httpService.post(
      `/tx/report-tx?apiKey=${this.apiKey}`,
      requestBody,
      {
        ...options,
      }
    )
  }

  public async getWalletsDetails(
    walletAddresses: WalletAddresses,
    options?: RequestOptions
  ): Promise<WalletDetailsResponse> {
    let walletAddressesQueryParams = ''
    for (let i = 0; i < walletAddresses.length; i++) {
      const walletAddress = walletAddresses[i]
      walletAddressesQueryParams += `&address=${walletAddress.blockchain}.${walletAddress.address}`
    }
    const axiosResponse = await this.httpService.get<WalletDetailsResponse>(
      `/wallets/details?apiKey=${this.apiKey}${walletAddressesQueryParams}`,
      { ...options }
    )
    return axiosResponse.data
  }

  public async getTokenBalance(
    tokenBalanceRequest: TokenBalanceRequest,
    options?: RequestOptions
  ): Promise<TokenBalanceResponse> {
    const axiosResponse = await this.httpService.get<TokenBalanceResponse>(
      `/wallets/token-balance?apiKey=${this.apiKey}`,
      { params: tokenBalanceRequest, ...options }
    )
    return axiosResponse.data
  }

  public async getMultipleTokenBalance(
    requestBody: MultipleTokenBalanceRequest,
    options?: RequestOptions
  ): Promise<MultipleTokenBalanceResponse> {
    const axiosResponse =
      await this.httpService.post<MultipleTokenBalanceResponse>(
        `/wallets/multiple-token-balance?apiKey=${this.apiKey}`,
        requestBody,
        { ...options }
      )
    return axiosResponse.data
  }
}
