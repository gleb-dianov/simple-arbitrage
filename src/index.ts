import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { Contract, ethers, providers, Wallet } from "ethers";
// import { BUNDLE_EXECUTOR_ABI } from "./abi";
import { UniswappyV2EthPair } from "./UniswappyV2EthPair";
import { FACTORY_ADDRESSES } from "./addresses";
import { Arbitrage } from "./Arbitrage";
import { get } from "https"
import { getDefaultRelaySigningKey } from "./utils";
import { getContractAddress } from '@ethersproject/address';
import fs from 'fs';

import buildExecutorContract from './buildExecutorContract';
import { getEmitHelpers } from "typescript";


const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "http://127.0.0.1:8545"
const PRIVATE_KEY = process.env.PRIVATE_KEY || ""

const FLASHBOTS_RELAY_SIGNING_KEY = 
  process.env.FLASHBOTS_RELAY_SIGNING_KEY || getDefaultRelaySigningKey();

const MINER_REWARD_PERCENTAGE = parseInt(process.env.MINER_REWARD_PERCENTAGE || "80")

if (PRIVATE_KEY === "") {
  console.warn("Must provide PRIVATE_KEY environment variable")
  process.exit(1)
}
if (FLASHBOTS_RELAY_SIGNING_KEY === "") {
  console.warn("Must provide FLASHBOTS_RELAY_SIGNING_KEY. Please see https://github.com/flashbots/pm/blob/main/guides/searcher-onboarding.md")
  process.exit(1)
}

const arbitrageSigningWallet = new Wallet(PRIVATE_KEY);

// Initialization
const bytecode = buildExecutorContract.evm.bytecode.object;

let abi: ethers.ContractInterface;

let contractExists: boolean;

if(fs.existsSync('../contract-abi.json')) {
  abi = require('../contract-abi.json')
  contractExists = true
} else {
  abi = buildExecutorContract.abi
  contractExists = false
}

const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL || ""

const provider = new providers.StaticJsonRpcProvider(ETHEREUM_RPC_URL);

const flashbotsRelaySigningWallet = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY);

function healthcheck() {
  if (HEALTHCHECK_URL === "") {
    return
  }
  get(HEALTHCHECK_URL).on('error', console.error);
}

async function main() {
  const address = await arbitrageSigningWallet.getAddress();

  console.log('Attempting to deploy from account:', address)

  let contractDeploymentTransaction: ethers.providers.TransactionRequest | null

  if(!contractExists) {
    const factory = new ethers.ContractFactory(abi, bytecode, arbitrageSigningWallet)

    contractDeploymentTransaction = factory.getDeployTransaction()
  } else {
    contractDeploymentTransaction = null
  }

  console.log('Prepared deployment transaction')

  const transactionCount = await arbitrageSigningWallet.getTransactionCount()

  const futureAddress = getContractAddress({
    from: address,
    nonce: transactionCount
  })

  if(!contractExists) {
    console.log('Contract will deployed to this address: ', futureAddress)
  }

  console.log("Searcher Wallet Address: " + await arbitrageSigningWallet.getAddress())
  console.log(
    "Flashbots Relay Signing Wallet Address: ",
    await flashbotsRelaySigningWallet.getAddress()
  )
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    flashbotsRelaySigningWallet
  );

  const arbitrage = new Arbitrage(
    arbitrageSigningWallet,
    flashbotsProvider,
    new Contract(futureAddress, abi, provider) 
  )

  const markets = await UniswappyV2EthPair.getUniswapMarketsByToken(provider, FACTORY_ADDRESSES);

  provider.on('block', async (blockNumber) => {
    await UniswappyV2EthPair.updateReserves(provider, markets.allMarketPairs);
    const bestCrossedMarkets = await arbitrage.evaluateMarkets(markets.marketsByToken);

    if (bestCrossedMarkets.length === 0) {
      console.log("No crossed markets")
      return
    }

    bestCrossedMarkets.forEach(Arbitrage.printCrossedMarket);
    arbitrage.takeCrossedMarkets(
      contractDeploymentTransaction,
      bestCrossedMarkets,
      blockNumber,
      MINER_REWARD_PERCENTAGE
    ).then(healthcheck).catch(console.error)
  })
}

main();
