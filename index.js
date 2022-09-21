const app = require("express")();
const { Utils } = require("./utils");
const { mnemonicToSecretKey, Indexer, Algodv2, makeApplicationCallTxnFromObject, encodeAddress, makeApplicationDeleteTxnFromObject, waitForConfirmation } = require("algosdk");

// mnemonic of algorand server account
const sv_mnemonic = 'hero rent roof dolphin refuse behind carry moon despair fabric smooth engage runway cave frost weekend decide bike drastic damage clap coach abandon absorb tourist';
let { sk, addr } = mnemonicToSecretKey(sv_mnemonic);

let indexerClient;
let algoClient;
const initializeIndexer = () => {
    const token = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const server = "http://localhost";
    indexerClient = new Indexer(token, server, 8980);
    algoClient = new Algodv2(token, server, 4001);
}

let stack = [];
const analizeTxns = async () => {
    const response = await indexerClient.lookupAccountTransactions(addr)
        .minRound(Utils.getLastBlock() + 1)
        .do();
    if (response.transactions.length > 0) {
        for (let i = response.transactions.length - 1; i >= 0; i--) {
            const txn = response.transactions[i];
            const appId = txn["application-transaction"]["application-id"];
            if (shouldProcessTxn(txn)) {
                await processTxnAndAppendIntoStack(appId);
            }
        }
        Utils.saveLastBlock((response.transactions[response.transactions.length - 1]["confirmed-round"]).toString());
    } else {
        console.log("Waiting for new txns...");
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    await analizeTxns();
}

const shouldProcessTxn = (txn) => {
    return txn["application-transaction"]["application-args"].length &&
        Buffer.from(txn["application-transaction"]["application-args"][0], "base64").toString() == 'bet';
}

const processTxnAndAppendIntoStack = async (appId) => {
    let application;

    try {
        application = (await indexerClient.lookupApplications(appId).do()).application;
    } catch (error) {
        console.log(JSON.parse(error.response.text).message)
    }

    let timestamp;
    let gambler;

    application.params["global-state"].forEach(element => {
        const key = Buffer.from(element.key, 'base64')
        if (key == 'bet_date') {
            timestamp = element.value.uint;
        }
        if (key == 'gambler_addr') {
            gambler = encodeAddress(Buffer.from(element.value.bytes, "base64"));
        }
    });

    const today = new Date();
    const betDate = new Date(timestamp * 1000);

    if (betDate > today) {
        stack.push({
            betDate,
            appId,
            gambler,
            creator: application.params.creator,
        })
        console.log("txn saved with date ~> ", betDate, " last round is", Utils.getLastBlock());
    } else {
        console.log("invalid date for txn ~> ", betDate, " is in the past. Ignoring...");
    }
}

const solveStack = async () => {
    if (stack.length) {
        const currentDate = new Date();
        for (let [index, stackItem] of stack.entries()) {
            if (currentDate >= stackItem.betDate) {
                console.log("solving bet...");
                console.log(stackItem);
                const txn = makeApplicationCallTxnFromObject({
                    from: addr,
                    suggestedParams: await algoClient.getTransactionParams().do(),
                    appIndex: stackItem.appId,
                    appArgs: [new Uint8Array(Buffer.from("solve")), new Uint8Array(Buffer.from("sunny"))],
                    accounts: [stackItem.creator, stackItem.gambler],
                })
                const del_app_txn = makeApplicationDeleteTxnFromObject({
                    from: addr,
                    suggestedParams: await algoClient.getTransactionParams().do(),
                    appIndex: stackItem.appId,
                })
                txn.fee = 2000;
                const signedTxn = txn.signTxn(sk);
                const del_app_signedTxn = del_app_txn.signTxn(sk);
                try {
                    const txn_res = await algoClient.sendRawTransaction(signedTxn).do();
                    await waitForConfirmation(algoClient, txn_res.txId, 4);
                    const del_txn_res = await algoClient.sendRawTransaction(del_app_signedTxn).do();
                    await waitForConfirmation(algoClient, del_txn_res.txId, 4);
                    console.log("Solve txn sent for app id ~> ", stackItem.appId);
                    stack.splice(index, 1);
                } catch (error) {
                    console.log(error);
                    stack.splice(index, 1);
                }
            }
        }
    } else {
        console.log("stack empty");
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    await solveStack();
}

app.listen(8080, async () => {
    initializeIndexer();
    solveStack();
    analizeTxns();
})

app.get('/info', (req, res) => {
    return res.status(200).json({
        stack,
        lastRound: Utils.getLastBlock()
    })
})