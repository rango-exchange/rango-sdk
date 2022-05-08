import { v4 } from 'uuid'

import { httpService } from './httpService'
import {
  MetaResponse,
  QuoteRequest,
  QuoteResponse,
  CheckApprovalResponse,
  StatusRequest,
  StatusResponse,
  SwapRequest,
  SwapResponse,
  ReportTransactionRequest,
  WalletDetailsResponse, assetToString
} from "../types"


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

  public async meta(): Promise<MetaResponse> {
    const axiosResponse = await httpService.get<MetaResponse>(
      `/basic/meta?apiKey=${this.apiKey}`
    )
    return axiosResponse.data
  }

  public async quote(
    quoteRequest: QuoteRequest
  ): Promise<QuoteResponse> {
    const body = {
      ...quoteRequest,
      from: assetToString(quoteRequest.from),
      to: assetToString(quoteRequest.to),
    }
    const axiosResponse = await httpService.get<QuoteResponse>(
      `/basic/quote?apiKey=${this.apiKey}`, {
        params: body,
        headers: { 'X-Rango-Id': this.deviceId }
      }
    )
    return axiosResponse.data
  }

  public async isApproved(
    requestId: string,
    txId: string
  ): Promise<CheckApprovalResponse> {
    const axiosResponse = await httpService.get<CheckApprovalResponse>(
      `/basic/is-approved?apiKey=${this.apiKey}`, {
        params: { requestId, txId },
        headers: { 'X-Rango-Id': this.deviceId }
      }
    )
    return axiosResponse.data
  }

  public async status(
    statusRequest: StatusRequest
  ): Promise<StatusResponse> {
    const axiosResponse = await httpService.get<StatusResponse>(
      `/basic/status?apiKey=${this.apiKey}`, {
        params: statusRequest,
        headers: { 'X-Rango-Id': this.deviceId }
      }
    )
    return axiosResponse.data
  }

  public async swap(
    swapRequest: SwapRequest
  ): Promise<SwapResponse> {
    const body = {
      ...swapRequest,
      from: assetToString(swapRequest.from),
      to: assetToString(swapRequest.to),
    }
    const axiosResponse = await httpService.get<SwapResponse>(
      `/basic/swap?apiKey=${this.apiKey}`, {
        params: body,
        headers: { 'X-Rango-Id': this.deviceId }
      }
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
