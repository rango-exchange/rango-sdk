import {
  QuoteResponse,
  StatusResponse,
  Token,
  TransactionStatus,
} from 'rango-sdk-basic'
import React from 'react'
import BigNumber from 'bignumber.js'

interface PropTypes {
  toToken: Token | null
  quote: QuoteResponse | null
  txStatus: StatusResponse | null
}

export function SwapDetails({ toToken, quote, txStatus }: PropTypes) {
  return (
    <div className="swap-details">
      {quote && (
        <div className="green-text">
          {quote.route?.swapper && (
            <img
              src={quote.route?.swapper?.logo}
              alt="swapper logo"
              width={50}
            />
          )}{' '}
          <br />
          {quote.route?.swapper?.title}
        </div>
      )}
      <br />
      {quote && (
        <div>
          <table
            className="border-collapse border"
            style={{ overflowWrap: 'anywhere' }}
          >
            <tbody>
              {quote && (
                <React.Fragment>
                  <tr>
                    <td>expected output</td>
                    <td>
                      {new BigNumber(quote?.route?.outputAmount || '0')
                        .shiftedBy(-(toToken?.decimals || 0))
                        .toString()}{' '}
                      {toToken?.symbol}
                    </td>
                  </tr>
                  <tr>
                    <td>time estimate</td>
                    <td>{quote.route?.estimatedTimeInSeconds}s</td>
                  </tr>
                </React.Fragment>
              )}
              {txStatus && (
                <React.Fragment>
                  <tr>
                    <td>status</td>
                    <td>{txStatus.status || TransactionStatus.RUNNING}</td>
                  </tr>
                  <tr>
                    <td>output</td>
                    <td>
                      {new BigNumber(txStatus.output?.amount || '0')
                        .shiftedBy(-(toToken?.decimals || 0))
                        .toString() || '?'}{' '}
                      {txStatus.output?.receivedToken?.symbol || ''}{' '}
                      {txStatus.output?.type || ''}
                    </td>
                  </tr>
                  <tr>
                    <td>error?</td>
                    <td>{txStatus.error || '--'}</td>
                  </tr>
                  {txStatus.explorerUrl?.map((item, id) => (
                    <tr key={id}>
                      <td>explorer url [{id}]</td>
                      <td>
                        <a href={item.url} target="_blank">
                          {item.description || 'Tx Hash'}
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!!txStatus.bridgeData && (
                    <React.Fragment>
                      <tr>
                        <td>srcChainId</td>
                        <td>{txStatus.bridgeData.srcChainId}</td>
                      </tr>
                      <tr>
                        <td>destChainId</td>
                        <td>{txStatus.bridgeData.destChainId}</td>
                      </tr>
                      <tr>
                        <td>srcToken</td>
                        <td>{txStatus.bridgeData.srcToken}</td>
                      </tr>
                      <tr>
                        <td>destToken</td>
                        <td>{txStatus.bridgeData.destToken}</td>
                      </tr>
                      <tr>
                        <td>srcTokenAmt</td>
                        <td>{txStatus.bridgeData.srcTokenAmt}</td>
                      </tr>
                      <tr>
                        <td>destTokenAmt</td>
                        <td>{txStatus.bridgeData.destTokenAmt}</td>
                      </tr>
                      <tr>
                        <td>srcTxHash</td>
                        <td>{txStatus.bridgeData.srcTxHash}</td>
                      </tr>
                      <tr>
                        <td>destTxHash</td>
                        <td>{txStatus.bridgeData.destTxHash}</td>
                      </tr>
                    </React.Fragment>
                  )}
                </React.Fragment>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
