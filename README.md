# 1. Rango Exchange Basic SDK (BETA)

[![npm version](https://badge.fury.io/js/rango-sdk-basic.svg)](https://badge.fury.io/js/rango-sdk-basic)
[![license](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://github.com/rango-exchange/rango-sdk/blob/master/LICENSE)


This is the first phase of Rango SDK which only wraps Rest API calls. In the next phase, we will handle connecting to the wallet providers.

> **WARNING:** The Rango SDK is still beta. Please use it on your own risk.

> **WARNING:** The Rango SDK has not stabilized yet, and we might make some breaking changes.


## 2. Installation

```shell
  npm install rango-sdk-basic --save
```

## 3. Usage

Please checkout the examples' folder for sample usage of the SDK. We will add more examples there soon.

- [Documents](https://docs.rango.exchange/integration/overview)
- [Examples](https://github.com/rango-exchange/rango-sdk/tree/master/examples/)


## 4. Message Passing API

When transfering tokens using Rango cross-chain API, you could pass a random message from the source chain to the desination and call your contract on the destination. In order to do so, you need to pass your contracts on source & destination chains plus an arbitrary hex message like this:

### 4. 1. SDK usage

```ts
const quoteResponse = await rangoClient.quote({
  amount,
  from,
  to,
  messagingProtocols: ['cbridge'],
  sourceContract: "<source contract address>",
  destinationContract: "<destination contract address>",
  imMessage: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000007E8A8b130272430008eCa062419ACD8B423d339D" 
})

```

As you can see in the code above, you could limit `messagingProtocols` used to a custom list like `['cbridge']`. 


```ts
const swapResponse = await rangoClient.swap({
  from,
  to,
  amount: inputAmount,
  fromAddress: fromAddress,
  toAddress: fromAddress,
  disableEstimate: false,
  referrerAddress: null,
  referrerFee: null,
  slippage: '1.0',
  messagingProtocols: ['cbridge'],
  sourceContract: "<source contract address>",
  destinationContract: "<destination contract address>",
  imMessage: "0x00000000000000000000000000000000000000000000000000000000000000010000000000000000000000007E8A8b130272430008eCa062419ACD8B423d339D"
})
```

### 4. 2. dAppp Contracts

Both dApp contracts on the source and destination chains should implemenet `IRangoMessageReceiver` interface. Rango will call `handleRangoMessage` function in case of `SUCCESS`, `REFUND_IN_SOURCE` or `REFUND_IN_DESTINATION`.
```solidity
interface IRangoMessageReceiver {
    enum ProcessStatus { SUCCESS, REFUND_IN_SOURCE, REFUND_IN_DESTINATION }

    function handleRangoMessage(
        address _token,
        uint _amount,
        ProcessStatus _status,
        bytes memory _message
    ) external;
}
```

And here is a sample dapp contract for the demo purpose. (The demo is very simple and you should consider adding security considerations yourself)

https://gist.github.com/RanGojo/1066ed2bf1556be7c2def69dbe2b3cb9

You need to deploy this contract on every chains needed and ask us to white list them in Rango Contract.

Here are some sample transaction for this contracts in action for swapping Fantom.FTM to BSC.BNB and relaying a custom message:

- Inbound transaction:
  https://ftmscan.com/tx/0x59a526e4376dc5b083b7876d47699b6c110fcba319c78553f3b8342674a68b3d

- Outbound transaction:
  https://bscscan.com/tx/0x8e91d7c3baf914cad8190bba4d608149d093d059ef769f9ca7a01a3d90a9c5e9

