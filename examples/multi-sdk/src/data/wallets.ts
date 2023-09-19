import { TransactionType } from "rango-sdk";
import { ExampleWallet } from "../types";

export const sampleWallets = {
  [TransactionType.EVM]: ExampleWallet.Metamask,
  [TransactionType.COSMOS]: ExampleWallet.Keplr,
}
