import uuid from 'uuid-random'

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
  SwapperMeta,
  RequestOptions,
  MessagingProtocolsResponse,
} from '../types'
import { Signer } from 'ethers'
import { executeEvmRoute as executeEvmRoute } from './executor'
import { prettifyError } from '../utils/errors'
import axios, { AxiosInstance } from 'axios'

type WalletAddress = { blockchain: string; address: string }

export class RangoClient {
  private readonly deviceId: string
  private readonly apiKey: string
  private readonly apiUrl: string
  private readonly httpService: AxiosInstance

  constructor(apiKey: string, debug = false, apiUrl?: string) {
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
    if (debug) {
      this.httpService.interceptors.request.use((request) => {
        console.log('Starting Request', JSON.stringify(request, null, 2))
        return request
      })
      this.httpService.interceptors.response.use((response) => {
        console.log('Response:', JSON.stringify(response, null, 2))
        return response
      })
    }
  }

  public async meta(options?: RequestOptions): Promise<MetaResponse> {
    const axiosResponse = await this.httpService.get<MetaResponse>(
      `/basic/meta?apiKey=${this.apiKey}`,
      { ...options }
    )
    return axiosResponse.data
  }

  public async chains(options?: RequestOptions): Promise<BlockchainMeta[]> {
    const axiosResponse = await this.httpService.get<BlockchainMeta[]>(
      `/basic/meta/blockchains?apiKey=${this.apiKey}`,
      { ...options }
    )
    return axiosResponse.data
  }

  public async swappers(options?: RequestOptions): Promise<SwapperMeta[]> {
    const axiosResponse = await this.httpService.get<SwapperMeta[]>(
      `/basic/meta/swappers?apiKey=${this.apiKey}`,
      { ...options }
    )
    return axiosResponse.data
  }

  public async messagingProtocols(
    options?: RequestOptions
  ): Promise<MessagingProtocolsResponse> {
    const axiosResponse =
      await this.httpService.get<MessagingProtocolsResponse>(
        `/basic/meta/messaging-protocols?apiKey=${this.apiKey}`,
        { ...options }
      )
    return axiosResponse.data
  }

  public async quote(
    quoteRequest: QuoteRequest,
    options?: RequestOptions
  ): Promise<QuoteResponse> {
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
    const axiosResponse = await this.httpService.get<QuoteResponse>(
      `/basic/quote?apiKey=${this.apiKey}`,
      {
        params: body,
        headers: { 'X-Rango-Id': this.deviceId },
        ...options,
      }
    )
    return axiosResponse.data
  }

  public async isApproved(
    requestId: string,
    txId: string,
    options?: RequestOptions
  ): Promise<CheckApprovalResponse> {
    const axiosResponse = await this.httpService.get<CheckApprovalResponse>(
      `/basic/is-approved?apiKey=${this.apiKey}`,
      {
        params: { requestId, txId },
        headers: { 'X-Rango-Id': this.deviceId },
        ...options,
      }
    )
    return axiosResponse.data
  }

  public async status(
    statusRequest: StatusRequest,
    options?: RequestOptions
  ): Promise<StatusResponse> {
    const axiosResponse = await this.httpService.get<StatusResponse>(
      `/basic/status?apiKey=${this.apiKey}`,
      {
        params: statusRequest,
        headers: { 'X-Rango-Id': this.deviceId },
        ...options,
      }
    )
    return axiosResponse.data
  }

  public async swap(
    swapRequest: SwapRequest,
    options?: RequestOptions
  ): Promise<SwapResponse> {
    const body = {
      ...swapRequest,
      from: assetToString(swapRequest.from),
      to: assetToString(swapRequest.to),
      referrerAddress: swapRequest.referrerAddress || null,
      referrerFee: swapRequest.referrerFee || null,
      disableEstimate: swapRequest.disableEstimate || false,
      swappers:
        !!swapRequest.swappers && swapRequest.swappers.length > 0
          ? swapRequest.swappers.join(',')
          : undefined,
      swapperGroups:
        !!swapRequest.swapperGroups && swapRequest.swapperGroups.length > 0
          ? swapRequest.swapperGroups.join(',')
          : undefined,
      messagingProtocols:
        !!swapRequest.messagingProtocols &&
        swapRequest.messagingProtocols.length > 0
          ? swapRequest.messagingProtocols.join(',')
          : undefined,
    }
    const axiosResponse = await this.httpService.get<SwapResponse>(
      `/basic/swap?apiKey=${this.apiKey}`,
      {
        params: body,
        headers: { 'X-Rango-Id': this.deviceId },
        ...options,
      }
    )
    return axiosResponse.data
  }

  public async reportFailure(
    requestBody: ReportTransactionRequest,
    options?: RequestOptions
  ): Promise<void> {
    await this.httpService.post(
      `/basic/report-tx?apiKey=${this.apiKey}`,
      requestBody,
      {
        headers: { 'X-Rango-Id': this.deviceId },
        ...options,
      }
    )
  }

  public async balance(
    walletAddress: WalletAddress,
    options?: RequestOptions
  ): Promise<WalletDetailsResponse> {
    const axiosResponse = await this.httpService.get<WalletDetailsResponse>(
      `/basic/balance?apiKey=${this.apiKey}`,
      {
        params: walletAddress,
        headers: { 'X-Rango-Id': this.deviceId },
        ...options,
      }
    )
    return axiosResponse.data
  }

  public async executeEvmRoute(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signer: any,
    route: SwapResponse
  ): Promise<StatusResponse> {
    try {
      return await executeEvmRoute(this, signer as Signer, route)
    } catch (error) {
      const prettifiedError = prettifyError(error)
      try {
        const message = prettifiedError?.message || 'Error executing the route'
        this.reportFailure({
          requestId: route.requestId,
          eventType: 'TX_FAIL',
          reason: message,
        })
      } catch (err) {
        console.log({ err })
      }
      throw prettifiedError
    }
  }
}
