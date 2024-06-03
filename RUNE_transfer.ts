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
import networkConfig from "config/network.config";

import { SeedWallet } from "utils/SeedWallet";
import { WIFWallet } from 'utils/WIFWallet'

initEccLib(ecc as any);
declare const window: any;
const ECPair: ECPairAPI = ECPairFactory(ecc);
const network = networks.testnet;
const networkType: string = networkConfig.networkType;

// const seed: string = process.env.MNEMONIC as string;
// const wallet = new SeedWallet({ networkType: networkType, seed: seed });

const privateKey: string = process.env.PRIVATE_KEY as string;
const wallet = new WIFWallet({ networkType: networkType, privateKey: privateKey });

const TEST_MODE = true;

const OPENAPI_UNISAT_URL = TEST_MODE
  ? "https://open-api-testnet.unisat.io"
  : "https://open-api.unisat.io";

const OPENAPI_URL = TEST_MODE
  ? "https://api-testnet.unisat.io/wallet-v4"
  : "https://api.unisat.io/wallet-v4";

const UNISAT_TOKEN =
  "50c50d3a720f82a3b93f164ff76989364bd49565b378b5c6a145c79251ee7672";

const DESTINATION_ADDRESS = 'tb1pcngsk49thk8e5m2ndfqv9sycltrjr4rx0prwhwr22mujl99y6szqw2kv0f';

interface IUtxo {
  txid: string;
  vout: number;
  value: number;
  scriptpubkey?: string;
}

async function pre_transfer(runeID: string, amount: number) {

  const runeBlockNumber = parseInt(runeID.split(":")[0]);
  const runeTxout = parseInt(runeID.split(":")[1]);

  const keyPair = wallet.ecPair;
  const edicts: any = [];
  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: 11,
    output: 1,
  });
  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount: 89,
    output: 2,
  });
  const mintstone = new Runestone(
    edicts,
    none(),
    none(),
    none()
  );

  const tweakedSigner = tweakSigner(keyPair, { network });
  // Generate an address from the tweaked public key
  const p2pktr = payments.p2tr({
    pubkey: toXOnly(tweakedSigner.publicKey),
    network,
  });
  const address = p2pktr.address ?? "";
  console.log(`Waiting till UTXO is detected at this Address: ${address}`);

  // https://open-api-testnet.unisat.io/v1/indexer/address/tb1pcngsk49thk8e5m2ndfqv9sycltrjr4rx0prwhwr22mujl99y6szqw2kv0f/runes/2587772:289/utxo

  const runeUTXO = {
    txid: 'a036e7826c4e8f6130e755848f2b2eb830c4ac18f17df771db68e80f99a18d87',
    vout: 1,
    value: 546
  };

  // https://open-api.unisat.io/v1/indexer/address/tb1pcngsk49thk8e5m2ndfqv9sycltrjr4rx0prwhwr22mujl99y6szqw2kv0f/utxo-data

  const btcUTXO = {
    txid: 'f0d400bbabd83e0e11a9079781ad596ec5a5ea67571dc4ec61df6594b7e94466',
    vout: 1,
    value: 5678287,
  }

  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: runeUTXO.txid,
    index: runeUTXO.vout,
    witnessUtxo: { value: runeUTXO.value, script: p2pktr.output! },
    tapInternalKey: toXOnly(keyPair.publicKey),
  });

  psbt.addInput({
    hash: btcUTXO.txid,
    index: btcUTXO.vout,
    witnessUtxo: { value: btcUTXO.value, script: p2pktr.output! },
    tapInternalKey: toXOnly(keyPair.publicKey),
  });

  psbt.addOutput({
    script: mintstone.encipher(),
    value: 0,
  });

  psbt.addOutput({
    address: DESTINATION_ADDRESS, // rune receive address
    value: 546,
  });

  psbt.addOutput({
    address: DESTINATION_ADDRESS, // rune receive address
    value: 546,
  });

  const fee = 100000;

  const change = btcUTXO.value - fee - 1092;

  psbt.addOutput({
    address: DESTINATION_ADDRESS, // change address
    value: change,
  });

  await signAndSend(tweakedSigner, psbt, address as string);
}

async function mintWithTaproot(runeID: string, amount: number) {

  const runeBlockNumber = parseInt(runeID.split(":")[0]);
  const runeTxout = parseInt(runeID.split(":")[1]);

  const keyPair = wallet.ecPair;
  const edicts: any = [];
  edicts.push({
    id: new RuneId(runeBlockNumber, runeTxout),
    amount,
    output: 50,
  });
  const mintstone = new Runestone(
    edicts,
    none(),
    none(),
    none()
  );

  const tweakedSigner = tweakSigner(keyPair, { network });
  // Generate an address from the tweaked public key
  const p2pktr = payments.p2tr({
    pubkey: toXOnly(tweakedSigner.publicKey),
    network,
  });
  const address = p2pktr.address ?? "";
  console.log(`Waiting till UTXO is detected at this Address: ${address}`);

  // https://open-api-testnet.unisat.io/v1/indexer/address/tb1pcngsk49thk8e5m2ndfqv9sycltrjr4rx0prwhwr22mujl99y6szqw2kv0f/runes/2587772:289/utxo

  const runeUTXO = {
    txid: '6f82a1d12b3bc236bf4fe269a4571161f1893c106536726f1ed5bb28f4d853a9',
    vout: 2,
    value: 546
  };

  // https://open-api.unisat.io/v1/indexer/address/tb1pcngsk49thk8e5m2ndfqv9sycltrjr4rx0prwhwr22mujl99y6szqw2kv0f/utxo-data

  const btcUTXO = {
    txid: '6f82a1d12b3bc236bf4fe269a4571161f1893c106536726f1ed5bb28f4d853a9',
    vout: 3,
    value: 5577195,
  }

  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: runeUTXO.txid,
    index: runeUTXO.vout,
    witnessUtxo: { value: runeUTXO.value, script: p2pktr.output! },
    tapInternalKey: toXOnly(keyPair.publicKey),
  });

  psbt.addInput({
    hash: btcUTXO.txid,
    index: btcUTXO.vout,
    witnessUtxo: { value: btcUTXO.value, script: p2pktr.output! },
    tapInternalKey: toXOnly(keyPair.publicKey),
  });

  psbt.addOutput({
    script: mintstone.encipher(),
    value: 0,
  });

  psbt.addOutput({
    address: DESTINATION_ADDRESS, // rune receive address
    value: 546,
  });

  const fee = 100000;

  const change = btcUTXO.value - fee - 546;

  psbt.addOutput({
    address: DESTINATION_ADDRESS, // change address
    value: change,
  });

  await signAndSend(tweakedSigner, psbt, address as string);
}

// main
mintWithTaproot('2587772:289', 89);
// pre_transfer('2587772:289', 11);

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

    psbt.signInput(0, keyPair);
    psbt.signInput(1, keyPair);

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
  console.log("getBtcUtxoByAddress functions ==>");
  console.log("address", address);
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

    console.log("UTXO", res.data);

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

interface IUTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
  value: number;
}