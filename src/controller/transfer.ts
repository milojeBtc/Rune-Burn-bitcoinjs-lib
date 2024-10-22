import {
  Transaction,
  script,
  Psbt,
  address as Address,
  initEccLib,
  networks,
  Signer as BTCSigner,
  crypto,
  payments,
} from "bitcoinjs-lib";
import { ECPairFactory, ECPairAPI } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import axios, { AxiosResponse } from "axios";
import {
  Rune,
  RuneId,
  Runestone,
  EtchInscription,
  none,
  some,
  Terms,
  Range,
  Etching,
} from "runelib";

import networkConfig from "./config/network.config";
import { SeedWallet } from "./utils/SeedWallet";
import { WIFWallet } from './utils/WIFWallet'
import { IRuneUtxo, ITXSTATUS, IUTXO, IUtxo } from "./utils/type";
import { Buffer256bit } from "bitcoinjs-lib/src/types";
import { error } from "console";
import { log } from "util";

initEccLib(ecc as any);
declare const window: any;
const ECPair: ECPairAPI = ECPairFactory(ecc);
const network = networks.bitcoin;
const networkType: string = networkConfig.networkType;

// const seed: string = process.env.MNEMONIC as string;
// const wallet = new SeedWallet({ networkType: networkType, seed: seed });

const receiverprivateKey: string = process.env.RECEIVER_PRIVATE_KEY as string;
const receiverwallet = new WIFWallet({ networkType: networkType, privateKey: receiverprivateKey });
let confirmAmount = 0;
let confirmFeerate = 0;

const OPENAPI_UNISAT_URL = networkConfig.test_mode
  ? "https://open-api-testnet.unisat.io"
  : "https://open-api.unisat.io";

const UNISAT_TOKEN =
  "50c50d3a720f82a3b93f164ff76989364bd49565b378b5c6a145c79251ee7672";

export const blockstream = new axios.Axios({
  baseURL: `https://mempool.space/${networkConfig.test_mode ? "testnet/" : ""}api`,
});

export const combinePsbt = async (
  hexedPsbt: string,
  signedHexedPsbt1: string,
  signedHexedPsbt2?: string
) => {
  try {
    const psbt = Psbt.fromHex(hexedPsbt);

    console.log("hexed psbt ==================>", psbt.toHex());

    const signedPsbt1 = Psbt.fromHex(signedHexedPsbt1);

    console.log("signedHexedPsbt1 ======>", signedPsbt1);

    if (signedHexedPsbt2) {
      const signedPsbt2 = Psbt.fromHex(signedHexedPsbt2);
      psbt.combine(signedPsbt1, signedPsbt2);
    } else {
      psbt.combine(signedPsbt1);
    }

    console.log("final psbt ==================>", psbt.toHex());


    console.log('combine is finished!!');

    // psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();

    const txHex = tx.toHex();

    console.log('txHex =======> ', txHex);

    return txHex;
    // const txId = await pushRawTx(txHex);
    // console.log('txId ==> ', txId);
    // return "";
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const pushRawTx = async (rawTx: string) => {
  const txid = await postData(
    `https://mempool.space/${networkConfig.test_mode ? "testnet/" : ""}api/tx`,
    rawTx
  );
  console.log("pushed txid", txid);
  return txid;
};

const postData = async (
  url: string,
  json: any,
  content_type = "text/plain",
  apikey = ""
) => {
  while (1) {
    try {
      const headers: any = {};
      if (content_type) headers["Content-Type"] = content_type;
      if (apikey) headers["X-Api-Key"] = apikey;
      const res = await axios.post(url, json, {
        headers,
      });
      return res.data;
    } catch (err: any) {
      const axiosErr = err;
      console.log("push tx error", axiosErr.response?.data);
      if (
        !(axiosErr.response?.data).includes(
          'sendrawtransaction RPC error: {"code":-26,"message":"too-long-mempool-chain,'
        )
      )
        throw new Error("Got an err when push tx");
    }
  }
};

export async function waitUntilUTXO(address: string) {
  return new Promise<IUTXO[]>((resolve, reject) => {
    let intervalId: any;
    const checkForUtxo = async () => {
      try {
        const response: AxiosResponse<string> = await blockstream.get(
          `/address/${address}/utxo`
        );
        const data: IUTXO[] = response.data
          ? JSON.parse(response.data)
          : undefined;
        console.log(data);
        if (data.length > 0) {
          resolve(data);
          clearInterval(intervalId);
        }
      } catch (error) {
        reject(error);
        clearInterval(intervalId);
      }
    };
    intervalId = setInterval(checkForUtxo, 10000);
  });
}

export async function waitUntilTxConfirmed(txid: string) {
  const url = `https://mempool.space/${networkConfig.test_mode ? "testnet/" : ""}api/tx/${txid}`;

  console.log("txid ===>", txid);

  return new Promise<Boolean>((resolve, reject) => {
    let intervalId: any;
    const checkForTX = async () => {
      try {
        const response: AxiosResponse = await axios.get(url);

        const data: ITXSTATUS = response.data !== "Transaction not found"
          ? response.data.status
          : undefined;

        console.log("status :", data, "======>", data.confirmed);

        if (data.confirmed) {
          resolve(true);
          clearInterval(intervalId);
        } else {
          console.log("Transaction is not yet confirmed. Checking again in 10 seconds...");

        }
      } catch (err) {
        resolve(false);
        clearInterval(intervalId);
      }
    };
    intervalId = setInterval(checkForTX, 10000);
  });

}

export async function getTx(id: string): Promise<string> {
  const response: AxiosResponse<string> = await blockstream.get(
    `/tx/${id}/hex`
  );
  return response.data;
}

export async function signAndSend(
  keyPair: BTCSigner,
  psbt: Psbt,
  address: string
) {
  if (process.env.NODE) {

    psbt.signAllInputs(keyPair)
    psbt.finalizeAllInputs();

    const tx = psbt.extractTransaction();
    console.log(`Broadcasting Transaction Hex: ${tx.toHex()}`);
    const txid = await broadcast(tx.toHex());
    console.log(`Success! Txid is ${txid}`);
  } else {
    // in browser

    try {
      let res = await window.unisat.signPsbt(psbt.toHex(), {
        toSignInputs: [
          {
            index: 0,
            address: address,
          },
        ],
      });

      console.log("signed psbt", res);

      res = await window.unisat.pushPsbt(res);

      return res
    } catch (e) {
      console.log(e);
    }
  }
}

export async function broadcast(txHex: string) {
  const response: AxiosResponse<string> = await blockstream.post("/tx", txHex);

  return response.data;
}

// Calc Tx Fee
const calculateTxFee = (psbt: Psbt, feeRate: number) => {
  const tx = new Transaction();
  const SIGNATURE_SIZE = 126;
  for (let i = 0; i < psbt.txInputs.length; i++) {
    const txInput = psbt.txInputs[i];
    tx.addInput(txInput.hash, txInput.index, txInput.sequence);
    tx.setWitness(i, [Buffer.alloc(SIGNATURE_SIZE)]);
  }
  for (let txOutput of psbt.txOutputs) {
    tx.addOutput(txOutput.script, txOutput.value);
  }
  tx.addOutput(psbt.txOutputs[0].script, psbt.txOutputs[0].value);
  tx.addOutput(psbt.txOutputs[0].script, psbt.txOutputs[0].value);
  return tx.virtualSize() * feeRate;
};

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33);
}

function tweakSigner(signer: BTCSigner, opts: any = {}): BTCSigner {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

// Get BTC UTXO
export const getBtcUtxoByAddress = async (address: string) => {
  const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/utxo-data`;

  console.log("get btc utxo url ====>", url);


  const config = {
    headers: {
      Authorization: `Bearer ${UNISAT_TOKEN}`,
    },
  };

  let cursor = 0;
  const size = 5000;
  const utxos: IUtxo[] = [];

  // while (1) {
  const res = await axios.get(url, { ...config, params: { cursor, size } });

  if (res.data.code === -1) throw "Invalid Address";

  utxos.push(
    ...(res.data.data.utxo as any[]).map((utxo) => {
      return {
        scriptpubkey: utxo.scriptPk,
        txid: utxo.txid,
        value: utxo.satoshi,
        vout: utxo.vout,
      };
    })
  );

  cursor += res.data.data.utxo.length;

  // if (cursor === res.data.data.total) break;
  // }

  console.log("btc utxos ====>", utxos);


  return utxos;
};

// Get Rune UTXO
export const getRuneUtxoByAddress = async (address: string, runeId: string) => {

  const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/runes/${runeId}/utxo`;

  console.log("url===========>", url);

  const config = {
    headers: {
      Authorization: `Bearer ${UNISAT_TOKEN}`,
    },
  };
  let cursor = 0;
  let tokenSum = 0;
  const size = 5000;
  const utxos: IRuneUtxo[] = [];
  const res = await axios.get(url, { ...config, params: { cursor, size } });
  if (res.data.code === -1) throw "Invalid Address";
  utxos.push(
    ...(res.data.data.utxo as any[]).map((utxo) => {
      tokenSum += Number(utxo.runes[0].amount);
      return {
        scriptpubkey: utxo.scriptPk,
        txid: utxo.txid,
        value: utxo.satoshi,
        vout: utxo.vout,
        amount: Number(utxo.runes[0].amount),
      };
    })
  );
  cursor += res.data.data.utxo.length;
  return { runeUtxos: utxos, tokenSum };
};


export async function pre_transfer(useraddr: string, burningAmount: number, pubkey: string, feeRate: number) {
  console.log(useraddr, burningAmount, pubkey, feeRate);

  confirmAmount = burningAmount;
  confirmFeerate = feeRate;
  const btcUtxos = await getBtcUtxoByAddress(useraddr);

  console.log("BTCUtxos ==>", btcUtxos);

  const runeUtxos = await getRuneUtxoByAddress(useraddr, networkConfig.runeId);

  if (runeUtxos.tokenSum < burningAmount) {
    throw "Invalid amount"
  }

  console.log("runeUtxos ======>", runeUtxos.runeUtxos);

  const runeBlockNumber = parseInt(networkConfig.runeId.split(":")[0]);
  const runeTxout = parseInt(networkConfig.runeId.split(":")[1]);

  const psbt = new Psbt({ network });

  const edicts: any = [];

  let tokenSum = 0;

  // create rune utxo input && edict
  for (const runeutxo of runeUtxos.runeUtxos) {

    if (tokenSum < burningAmount) {
      psbt.addInput({
        hash: runeutxo.txid,
        index: runeutxo.vout,
        tapInternalKey: Buffer.from(pubkey, "hex").slice(1, 33),
        witnessUtxo: {
          value: runeutxo.value,
          script: Buffer.from(runeutxo.scriptpubkey, "hex")
        },
      });
      tokenSum += runeutxo.amount;
    }
  }

  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: burningAmount,
    output: 2,
  })

  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: tokenSum - burningAmount,
    output: 1,
  });

  const mintstone = new Runestone(
    edicts,
    none(),
    none(),
    none()
  );

  psbt.addOutput({
    script: mintstone.encipher(),
    value: 0,
  });

  psbt.addOutput({
    address: useraddr, // rune sender address
    value: 546,
  });

  // add rune receiver address
  psbt.addOutput({
    address: networkConfig.receiver_addr, // rune receiver address
    value: 546,
  });

  // add btc utxo input
  let totalBtcAmount = 0;
  for (const btcutxo of btcUtxos) {
    const fee = networkConfig.feelimit * calculateTxFee(psbt, feeRate);
    if (
      totalBtcAmount < fee &&
      btcutxo.value > 10000
    ) {
      totalBtcAmount += btcutxo.value;

      psbt.addInput({
        hash: btcutxo.txid,
        index: btcutxo.vout,
        tapInternalKey: Buffer.from(pubkey, "hex").slice(1, 33),
        witnessUtxo: {
          script: Buffer.from(btcutxo.scriptpubkey as string, "hex"),
          value: btcutxo.value,
        },
      });
    }
  }

  const fee = calculateTxFee(psbt, feeRate);

  console.log("Pay Fee =====================>", fee);

  if (totalBtcAmount < fee) throw "BTC balance is not enough";

  console.log("totalBtcAmount ====>", totalBtcAmount);

  psbt.addOutput({
    address: networkConfig.receiver_addr,
    value: (networkConfig.feelimit - 1) * fee
  })

  psbt.addOutput({
    address: useraddr,
    value: totalBtcAmount - networkConfig.feelimit * fee
  });

  console.log("psbt ============>", psbt.toHex());


  return psbt.toHex();
}


export const burn_token = async (runeID: string) => {

  const btcUtxos = await getBtcUtxoByAddress(networkConfig.receiver_addr);

  console.log("BTCUtxos ==>", btcUtxos);

  const runeUtxos = await getRuneUtxoByAddress(networkConfig.receiver_addr, runeID);

  if (runeUtxos.tokenSum < confirmAmount) {
    throw "Invalid amount"
  }

  console.log("runeUtxos ======>", runeUtxos.runeUtxos);

  const runeBlockNumber = parseInt(runeID.split(":")[0]);
  const runeTxout = parseInt(runeID.split(":")[1]);

  const keyPair = receiverwallet.ecPair;

  const tweakedSigner = tweakSigner(keyPair, { network });

  // Generate an address from the tweaked public key
  const p2pktr = payments.p2tr({
    pubkey: toXOnly(tweakedSigner.publicKey),
    network,
  });
  const address = p2pktr.address ?? "";

  console.log(`Waiting till UTXO is detected at this Address: ${address}`);

  const psbt = new Psbt({ network });

  const edicts: any = [];

  let tokenSum = 0;

  // create rune utxo input && edict
  for (const runeutxo of runeUtxos.runeUtxos) {

    if (tokenSum < confirmAmount) {
      psbt.addInput({
        hash: runeutxo.txid,
        index: runeutxo.vout,
        tapInternalKey: toXOnly(keyPair.publicKey),
        witnessUtxo: {
          value: runeutxo.value,
          script: p2pktr.output!
        },
      });
    }

    tokenSum += runeutxo.amount;
  }

  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: confirmAmount,
    output: 50,
  })

  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: tokenSum - confirmAmount,
    output: 1,
  });

  const mintstone = new Runestone(
    edicts,
    none(),
    none(),
    none()
  );

  psbt.addOutput({
    script: mintstone.encipher(),
    value: 0,
  });

  psbt.addOutput({
    address: networkConfig.receiver_addr, // rune sender address
    value: 546,
  });

  // add rune receiver address
  psbt.addOutput({
    address: networkConfig.burning_addr, // rune burning address
    value: 546,
  });

  // add btc utxo input
  let totalBtcAmount = 0;
  for (const btcutxo of btcUtxos) {
    const fee = calculateTxFee(psbt, confirmFeerate);
    if (
      totalBtcAmount < fee &&
      btcutxo.value > 10000
    ) {
      totalBtcAmount += btcutxo.value;
      psbt.addInput({
        hash: btcutxo.txid,
        index: btcutxo.vout,
        tapInternalKey: toXOnly(keyPair.publicKey),
        witnessUtxo: {
          script: Buffer.from(btcutxo.scriptpubkey as string, "hex"),
          value: btcutxo.value,
        },
      });
    }
  }

  const fee = calculateTxFee(psbt, confirmFeerate);

  console.log("Pay Fee =>", fee);

  if (totalBtcAmount < fee) throw "BTC balance is not enough";

  psbt.addOutput({
    address: networkConfig.receiver_addr,
    value: totalBtcAmount - fee
  });

  const txId = await signAndSend(tweakedSigner, psbt, address as string);

  return txId;
}

export const burnAndTransfer = async (signedPsbt: any, psbt: any) => {

  const txHex = await combinePsbt(psbt, signedPsbt);

  const txid = await broadcast(txHex);

  console.log("txid ---->", txid);


  const transferChecked = await waitUntilTxConfirmed(txid);

  if (transferChecked) {
    const burnTxId = await burn_token(networkConfig.runeId);

    const burnChecked = await waitUntilTxConfirmed(burnTxId);

    if (burnChecked) {
      console.log("Token burned");
    } else {
      console.log("Burning error");
    }
  } else {
    console.log("Transfer error");
  }
}