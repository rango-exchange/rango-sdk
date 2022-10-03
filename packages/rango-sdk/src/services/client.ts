import { v4 } from 'uuid'

import { httpService } from 'common'
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
} from '../types'

type WalletAddresses = { blockchain: string; address: string }[]

export class RangoClient {
  private readonly deviceId: string

  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    try {
      if (typeof window !== 'undefined') {
        const deviceId = localStorage.getItem('deviceId')
        if (deviceId) {
          this.deviceId = deviceId
        } else {
          const generatedId = v4()
          localStorage.setItem('deviceId', generatedId)
          this.deviceId = generatedId
        }
      } else {
        this.deviceId = v4()
      }
    } catch (e) {
      this.deviceId = v4()
    }
  }

  public async getAllMetadata(): Promise<MetaResponse> {
    const axiosResponse = await httpService.get<MetaResponse>(
      `/meta?apiKey=${this.apiKey}`
    )
    return axiosResponse.data
  }

  public async getBestRoute(
    requestBody: BestRouteRequest
  ): Promise<BestRouteResponse> {
    const axiosResponse = await httpService.post<BestRouteResponse>(
      `/routing/best?apiKey=${this.apiKey}`,
      requestBody,
      { headers: { 'X-Rango-Id': this.deviceId } }
    )
    return axiosResponse.data
  }

  public async checkApproval(
    requestId: string
  ): Promise<CheckApprovalResponse> {
    const axiosResponse = await httpService.get<CheckApprovalResponse>(
      `/tx/${requestId}/check-approval?apiKey=${this.apiKey}`
    )
    return axiosResponse.data
  }

  public async checkStatus(
    requestBody: CheckTxStatusRequest
  ): Promise<TransactionStatusResponse> {
    const axiosResponse = await httpService.post<TransactionStatusResponse>(
      `/tx/check-status?apiKey=${this.apiKey}`,
      requestBody
    )
    return axiosResponse.data
  }

  public async createTransaction(
    requestBody: CreateTransactionRequest
  ): Promise<CreateTransactionResponse> {
    const axiosResponse = await httpService.post<CreateTransactionResponse>(
      `/tx/create?apiKey=${this.apiKey}`,
      requestBody
    )
    return axiosResponse.data
  }

  public async reportFailure(
    requestBody: ReportTransactionRequest
  ): Promise<void> {
    await httpService.post(`/tx/report-tx?apiKey=${this.apiKey}`, requestBody)
  }

  public async getWalletsDetails(
    walletAddresses: WalletAddresses
  ): Promise<WalletDetailsResponse> {
    let walletAddressesQueryParams = ''
    for (let i = 0; i < walletAddresses.length; i++) {
      const walletAddress = walletAddresses[i]
      walletAddressesQueryParams += `&address=${walletAddress.blockchain}.${walletAddress.address}`
    }
    const axiosResponse = await httpService.get<WalletDetailsResponse>(
      `/wallets/details?apiKey=${this.apiKey}${walletAddressesQueryParams}`
    )
    return axiosResponse.data
  }
}
