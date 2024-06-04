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

import { SeedWallet } from "utils/SeedWallet";
import { WIFWallet } from 'utils/WIFWallet'
import { IRuneUtxo, IUTXO, IUtxo } from "utils/type";
import { Buffer256bit } from "bitcoinjs-lib/src/types";

initEccLib(ecc as any);
declare const window: any;
const ECPair: ECPairAPI = ECPairFactory(ecc);
const network = networks.testnet;
const networkType: string = networkConfig.networkType;

// const seed: string = process.env.MNEMONIC as string;
// const wallet = new SeedWallet({ networkType: networkType, seed: seed });

const privateKey: string = process.env.PRIVATE_KEY as string;
const wallet = new WIFWallet({ networkType: networkType, privateKey: privateKey });

const receiverprivateKey: string = process.env.RECEIVER_PRIVATE_KEY as string;
const receiverwallet = new WIFWallet({ networkType: networkType, privateKey: receiverprivateKey });


const OPENAPI_UNISAT_URL = networkConfig.networkType
  ? "https://open-api-testnet.unisat.io"
  : "https://open-api.unisat.io";

const UNISAT_TOKEN =
  "50c50d3a720f82a3b93f164ff76989364bd49565b378b5c6a145c79251ee7672";

export const blockstream = new axios.Axios({
  baseURL: `https://mempool.space/testnet/api`,
});

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

      console.log("txid", res);
    } catch (e) {
      console.log(e);
    }
  }
}

export async function broadcast(txHex: string) {
  const blockstream = new axios.Axios({
    baseURL: `https://mempool.space/testnet/api`,
  });

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
  console.log("get btcutxo by address ======>", address);
  const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/utxo-data`;

  const config = {
    headers: {
      Authorization: `Bearer ${UNISAT_TOKEN}`,
    },
  };

  let cursor = 0;
  const size = 5000;
  const utxos: IUtxo[] = [];

  while (1) {
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

    if (cursor === res.data.data.total) break;
  }

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
  while (1) {
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
    if (cursor === res.data.data.total) break;
  }
  return { runeUtxos: utxos, tokenSum };
};


async function pre_transfer(runeID: string, amount: number) {

  const btcUtxos = await getBtcUtxoByAddress(networkConfig.user_addr);

  console.log("BTCUtxos ==>", btcUtxos);

  const runeUtxos = await getRuneUtxoByAddress(networkConfig.user_addr, runeID);

  if (runeUtxos.tokenSum < networkConfig.claim_amount) {
    throw "Invalid amount"
  }

  console.log("runeUtxos ======>", runeUtxos.runeUtxos);

  const runeBlockNumber = parseInt(runeID.split(":")[0]);
  const runeTxout = parseInt(runeID.split(":")[1]);

  const keyPair = wallet.ecPair;

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
    
    if (tokenSum < networkConfig.claim_amount) {
      psbt.addInput({
        hash: runeutxo.txid,
        index: runeutxo.vout,
        tapInternalKey: toXOnly(keyPair.publicKey),
        witnessUtxo: {
          value: runeutxo.value,
          script: p2pktr.output!
        },
      });
      tokenSum += runeutxo.amount;
    } 
  }

  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: networkConfig.claim_amount,
    output: 2,
  })

  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: tokenSum - networkConfig.claim_amount,
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
    address: networkConfig.user_addr, // rune sender address
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
    const fee = networkConfig.feelimit * calculateTxFee(psbt, networkConfig.feeRate);
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

  const fee = networkConfig.feelimit * calculateTxFee(psbt, networkConfig.feeRate);

  console.log("Pay Fee =====================>", fee);

  if (totalBtcAmount < fee) throw "BTC balance is not enough";

  psbt.addOutput({
    address: networkConfig.user_addr,
    value: totalBtcAmount - fee
  });

  console.log("psbt ============>", psbt);

  // await signAndSend(tweakedSigner, psbt, address as string);
}

async function burn_token(runeID: string, amount: number) {

  const btcUtxos = await getBtcUtxoByAddress(networkConfig.user_addr);

  console.log("BTCUtxos ==>", btcUtxos);

  const runeUtxos = await getRuneUtxoByAddress(networkConfig.user_addr, runeID);

  if (runeUtxos.tokenSum < networkConfig.claim_amount) {
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

    psbt.addInput({
      hash: runeutxo.txid,
      index: runeutxo.vout,
      tapInternalKey: toXOnly(keyPair.publicKey),
      witnessUtxo: {
        value: runeutxo.value,
        script: p2pktr.output!
      },
    });

    tokenSum += runeutxo.amount;

    if (tokenSum > networkConfig.claim_amount) {
      return edicts
    }
  }

  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: networkConfig.claim_amount,
    output: 50,
  })

  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: tokenSum - networkConfig.claim_amount,
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
    const fee = calculateTxFee(psbt, networkConfig.feeRate);
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

  const fee = calculateTxFee(psbt, networkConfig.feeRate);

  console.log("Pay Fee =>", fee);

  if (totalBtcAmount < fee) throw "BTC balance is not enough";

  psbt.addOutput({
    address: networkConfig.receiver_addr,
    value: totalBtcAmount - fee
  });

  await signAndSend(tweakedSigner, psbt, address as string);
}

// main
const index = async () => {

  await pre_transfer(networkConfig.runeId, networkConfig.claim_amount);   // transfer rune token from user wallet to receiver wallet.
  // await burn_token(networkConfig.runeId, networkConfig.claim_amount);

}

index();