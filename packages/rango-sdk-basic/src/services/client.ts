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
  WalletDetailsResponse,
  assetToString,
  BlockchainMeta,
  SwapperMetaDto,
} from '../types'
import { Signer } from 'ethers'
import { executeEvmRoute as executeEvmRoute } from './executor'
import { prettifyError } from '../utils/errors'

type WalletAddress = { blockchain: string; address: string }

export class RangoClient {
  private readonly deviceId: string

  private readonly apiKey: string

  constructor(apiKey: string, debug = false) {
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
    if (debug) {
      httpService.interceptors.request.use((request: any) => {
        console.log('Starting Request', JSON.stringify(request, null, 2))
        return request
      })
      httpService.interceptors.response.use((response: any) => {
        console.log('Response:', JSON.stringify(response, null, 2))
        return response
      })
    }
  }

  public async meta(): Promise<MetaResponse> {
    const axiosResponse = await httpService.get<MetaResponse>(
      `/basic/meta?apiKey=${this.apiKey}`
    )
    return axiosResponse.data
  }

  public async chains(): Promise<BlockchainMeta[]> {
    const axiosResponse = await httpService.get<BlockchainMeta[]>(
      `/basic/meta/blockchains?apiKey=${this.apiKey}`
    )
    return axiosResponse.data
  }

  public async swappers(): Promise<SwapperMetaDto[]> {
    const axiosResponse = await httpService.get<SwapperMetaDto[]>(
      `/basic/meta/swappers?apiKey=${this.apiKey}`
    )
    return axiosResponse.data
  }

  public async quote(quoteRequest: QuoteRequest): Promise<QuoteResponse> {
    const body = {
      ...quoteRequest,
      from: assetToString(quoteRequest.from),
      to: assetToString(quoteRequest.to),
      swappers:
        !!quoteRequest.swappers && quoteRequest.swappers.length > 0
          ? quoteRequest.swappers.join(',')
          : undefined,
      messagingProtocols:
        !!quoteRequest.messagingProtocols &&
        quoteRequest.messagingProtocols.length > 0
          ? quoteRequest.messagingProtocols.join(',')
          : undefined,
    }
    const axiosResponse = await httpService.get<QuoteResponse>(
      `/basic/quote?apiKey=${this.apiKey}`,
      {
        params: body,
        headers: { 'X-Rango-Id': this.deviceId },
      }
    )
    return axiosResponse.data
  }

  public async isApproved(
    requestId: string,
    txId: string
  ): Promise<CheckApprovalResponse> {
    const axiosResponse = await httpService.get<CheckApprovalResponse>(
      `/basic/is-approved?apiKey=${this.apiKey}`,
      {
        params: { requestId, txId },
        headers: { 'X-Rango-Id': this.deviceId },
      }
    )
    return axiosResponse.data
  }

  public async status(statusRequest: StatusRequest): Promise<StatusResponse> {
    const axiosResponse = await httpService.get<StatusResponse>(
      `/basic/status?apiKey=${this.apiKey}`,
      {
        params: statusRequest,
        headers: { 'X-Rango-Id': this.deviceId },
      }
    )
    return axiosResponse.data
  }

  public async swap(swapRequest: SwapRequest): Promise<SwapResponse> {
    const body = {
      ...swapRequest,
      from: assetToString(swapRequest.from),
      to: assetToString(swapRequest.to),
      swappers:
        !!swapRequest.swappers && swapRequest.swappers.length > 0
          ? swapRequest.swappers.join(',')
          : undefined,
      messagingProtocols:
        !!swapRequest.messagingProtocols &&
        swapRequest.messagingProtocols.length > 0
          ? swapRequest.messagingProtocols.join(',')
          : undefined,
    }
    const axiosResponse = await httpService.get<SwapResponse>(
      `/basic/swap?apiKey=${this.apiKey}`,
      {
        params: body,
        headers: { 'X-Rango-Id': this.deviceId },
      }
    )
    return axiosResponse.data
  }

  public async reportFailure(
    requestBody: ReportTransactionRequest
  ): Promise<void> {
    await httpService.post(
      `/basic/report-tx?apiKey=${this.apiKey}`,
      requestBody,
      {
        headers: { 'X-Rango-Id': this.deviceId },
      }
    )
  }

  public async balance(
    walletAddress: WalletAddress
  ): Promise<WalletDetailsResponse> {
    const axiosResponse = await httpService.get<WalletDetailsResponse>(
      `/basic/balance?apiKey=${this.apiKey}`,
      {
        params: walletAddress,
        headers: { 'X-Rango-Id': this.deviceId },
      }
    )
    return axiosResponse.data
  }

  public async executeEvmRoute(
    signer: any,
    route: SwapResponse
  ): Promise<StatusResponse> {
    try {
      return await executeEvmRoute(this, signer as Signer, route)
    } catch (error) {
      throw prettifyError(error)
    }
  }
}
