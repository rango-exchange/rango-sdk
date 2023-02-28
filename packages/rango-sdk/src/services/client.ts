import uuid from 'uuid-random'
import {
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

  public async getAllMetadata(options?: RequestOptions): Promise<MetaResponse> {
    const axiosResponse = await this.httpService.get<MetaResponse>(
      `/meta?apiKey=${this.apiKey}`,
      { ...options }
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

  public async checkApproval(
    requestId: string,
    options?: RequestOptions
  ): Promise<CheckApprovalResponse> {
    const axiosResponse = await this.httpService.get<CheckApprovalResponse>(
      `/tx/${requestId}/check-approval?apiKey=${this.apiKey}`,
      { ...options }
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
}
