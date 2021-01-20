const {config} = require('./config.js');
var Web3 = require('web3');
const BigNumber = require('bignumber.js');
const { randomHex } = require("web3-utils");

const oneSplitABI = require('./abis/onesplit.json');
const onesplitAddress = '0xC586BeF4a0992C495Cf22e1aeEE4E446CECDee0E'; // 1plit contract address on Main net

const erc20ABI = require('./abis/erc20.json');
const daiAddress = '0x6b175474e89094c44da98b954eedeac495271d0f';

const fromTokenDecimals = 18;

const ethAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'; 

const gasAmount = 300000;

const web3 = new Web3(new Web3.providers.HttpProvider('https://mainnet.infura.io/v3/' + config.INFURA_KEY, { timeout: 20000000 }));

web3.eth.accounts.wallet.create(0, randomHex(32));

const pk = config.PRIVATE_KEY;
const account = web3.eth.accounts.privateKeyToAccount(pk);
web3.eth.accounts.wallet.add(account);
const fromWallet = web3.eth.accounts.wallet[0].address;


const onesplitContract = new web3.eth.Contract(oneSplitABI, onesplitAddress);
const daiToken = new web3.eth.Contract(erc20ABI, daiAddress);

const oneSplitDexes = [
    "Uniswap",
    "Kyber",
    "Bancor",
    "Oasis",
    "Curve Compound",
    "Curve USDT",
    "Curve Y",
    "Curve Binance",
    "Curve Synthetix",
    "Uniswap Compound",
    "Uniswap CHAI",
    "Uniswap Aave",
    "Mooniswap",
    "Uniswap V2",
    "Uniswap V2 ETH",
    "Uniswap V2 DAI",
    "Uniswap V2 USDC",
    "Curve Pax",
    "Curve renBTC",
    "Curve tBTC",
    "Dforce XSwap",
    "Shell",
    "mStable mUSD",
    "Curve sBTC",
    "Balancer 1",
    "Balancer 2",
    "Balancer 3",
    "Kyber 1",
    "Kyber 2",
    "Kyber 3",
    "Kyber 4"
]

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitTransaction(txHash) {
    let tx = null;
    while (tx == null) {
        tx = await web3.eth.getTransactionReceipt(txHash);
        await sleep(2000);
    }
    console.log("Transaction " + txHash + " was mined.");
    return (tx.status);
}

function approveDaiToken(tokenInstance, receiver, amount, estimatedGasPrice, callback) {
    tokenInstance.methods.approve(receiver, amount).send({ from: fromWallet, gas: gasAmount, gasPrice: estimatedGasPrice }, async function(error, txHash) {
        if (error) {
            console.log("Dai could not be approved", error);
            return;
        }
        console.log("Dai token approved to " + receiver);
        const status = await waitTransaction(txHash);
        if (!status) {
            console.log("Approval transaction failed.");
            return;
        }
        callback();
    })
}

async function getQuotes(ethAddress, daiAddress, amount, callback) {
    let quoteEthToDai = null;
    let quoteDaiToEth = null;
    let tradePossible = false;
    try {
        quoteEthToDai = await onesplitContract.methods.getExpectedReturn(ethAddress, daiAddress, amount, 100, 0x40000000).call();
        quoteDaiToEth = await onesplitContract.methods.getExpectedReturn(daiAddress, ethAddress, new BigNumber(new BigNumber(quoteEthToDai.returnAmount).shiftedBy(-fromTokenDecimals)).shiftedBy(fromTokenDecimals).toFixed(), 100, 0x40000000).call();
    } catch (error) {
        console.log('Impossible to get the quote', error)
    }
    console.log("Trade From: " + ethAddress);
    console.log("Trade To: " + daiAddress);
    console.log("Trade Amount: " + new BigNumber(amount).shiftedBy(-fromTokenDecimals).toString() + " Ether");
    console.log("Dai Expected Return: " + new BigNumber(quoteEthToDai.returnAmount).shiftedBy(-fromTokenDecimals).toString());
    console.log("Using Dexes:");
    for (let index = 0; index < quoteEthToDai.distribution.length; index++) {
        console.log(oneSplitDexes[index] + ": " + quoteEthToDai.distribution[index] + "%");
    }
    console.log("Trade From: " + daiAddress);
    console.log("Trade To: " + ethAddress);
    console.log("Trade Amount: " + new BigNumber(quoteEthToDai.returnAmount).shiftedBy(-fromTokenDecimals) + " Dai");
    console.log("Eth Expected Return: " + new BigNumber(quoteDaiToEth.returnAmount).shiftedBy(-fromTokenDecimals).toString())
    console.log("Using Dexes:");
    for (let index = 0; index < quoteDaiToEth.distribution.length; index++) {
        console.log(oneSplitDexes[index] + ": " + quoteDaiToEth.distribution[index] + "%");
    }
    if(new BigNumber(quoteDaiToEth.returnAmount).shiftedBy(-fromTokenDecimals).toString() - new BigNumber(amount).shiftedBy(-fromTokenDecimals).toString() > .03){
        numberOfExchanges = numberOfExchanges + 1;
        tradePossible = true;
        callback(quoteEthToDai, quoteDaiToEth, tradePossible);
      }
    console.log("Number of Current Exchanges that Happened: " + numberOfExchanges)
    
}

async function Trading(daiAddress, ethAddress, amountWithDecimalsEth, estimatedGasPrice){
    getQuotes(ethAddress, daiAddress, amountWithDecimalsEth, async function(quoteEthToDai, quoteDaiToEth, tradePossible) {
        if(tradePossible){
            let status = false;
            console.log("/n Swapping Trade Taking Place /n")
            console.log("Getting the Dai Now")
            // We get the balance before the swap just for logging purpose
            let ethBalanceBefore = await web3.eth.getBalance(fromWallet);
            let daiBalanceBefore = await daiToken.methods.balanceOf(fromWallet).call();
            await onesplitContract.methods.swap(ethAddress, daiAddress, amountWithDecimalsEth, quoteEthToDai.returnAmount, quoteEthToDai.distribution, 0x40000000).send({ from: fromWallet, gas: gasAmount, gasPrice: estimatedGasPrice, value:amountWithDecimalsEth }, async function(error, txHash) {
                if (error) {
                    console.log("Could not complete the swap for Dai", error);
                    throw new Error('This is not an error in code. Error at Transaction. This is just to abort javascript');
                    return;
                }
                status = await waitTransaction(txHash);
                // We check the final balances after the swap for logging purpose
                let ethBalanceAfter = await web3.eth.getBalance(fromWallet);
                let daiBalanceAfter = await daiToken.methods.balanceOf(fromWallet).call();
                console.log("Balances after getting Dai:")
                console.log("Change in ETH balance", new BigNumber(ethBalanceAfter).minus(ethBalanceBefore).shiftedBy(-fromTokenDecimals).toFixed(2));
                console.log("Change in DAI balance", new BigNumber(daiBalanceAfter).minus(daiBalanceBefore).shiftedBy(-fromTokenDecimals).toFixed(2));
                if(status){
                    console.log("Trade for Dai Succeeded.")
                    console.log("Resuming...")
                    daiBalanceBefore = await daiToken.methods.balanceOf(fromWallet).call();
                    approveDaiToken(daiToken, onesplitAddress, new BigNumber(new BigNumber(daiBalanceBefore).shiftedBy(-fromTokenDecimals)).shiftedBy(fromTokenDecimals).toFixed(), estimatedGasPrice, async function() {
                        // We get the balance before the swap just for logging purpose
                        let ethBalanceBefore = await web3.eth.getBalance(fromWallet);
                        await onesplitContract.methods.swap(daiAddress, ethAddress, new BigNumber(new BigNumber(daiBalanceBefore).shiftedBy(-fromTokenDecimals)).shiftedBy(fromTokenDecimals).toFixed(), quoteDaiToEth.returnAmount, quoteDaiToEth.distribution, 0x40000000).send({ from: fromWallet, gas: gasAmount, gasPrice: estimatedGasPrice }, async function(error, txHash) {
                            if (error) {
                                console.log("Could not complete the swap for Eth", error);
                                return;
                            }
                            status = await waitTransaction(txHash);
                            // We check the final balances after the swap for logging purpose
                            let ethBalanceAfter = await web3.eth.getBalance(fromWallet);
                            let daiBalanceAfter = await daiToken.methods.balanceOf(fromWallet).call();
                            console.log("Final balances:")
                            console.log("Change in ETH balance", new BigNumber(ethBalanceAfter).minus(ethBalanceBefore).shiftedBy(-fromTokenDecimals).toFixed(2));
                            console.log("Change in DAI balance", new BigNumber(daiBalanceAfter).minus(daiBalanceBefore).shiftedBy(-fromTokenDecimals).toFixed(2));
                        });
                    });
                throw new Error('This is not an error in code. First Successful Transaction. Check out Result');
                } else if(!status){
                    console.log("Trade Failed. Stopping Now")
                    throw new Error('This is not an error in code. Error at Transaction. This is just to abort javascript');
                }
            });
        }
    });
}

let monitoringPrice = false;
let numberOfExchanges = 0;

async function monitorPrice() {
  if(monitoringPrice) {
    return
  }

  console.log("Checking prices...")
  amountToExchange= await web3.eth.getBalance(config.PUBLIC_ADDRESS);//for eth amount
  amountToExchange = (amountToExchange * .9).toString()
  estimatedGasPrice = await web3.eth.getGasPrice()
  if(Number(estimatedGasPrice) < 85000000000){
    await Trading(daiAddress, ethAddress, amountToExchange, estimatedGasPrice)
  }
}


// Check markets every n seconds
const POLLING_INTERVAL = process.env.POLLING_INTERVAL || 5000 // 5 Seconds
priceMonitor = setInterval(async () => { await monitorPrice() }, POLLING_INTERVAL)