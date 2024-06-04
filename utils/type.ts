export interface IUtxo {
    txid: string;
    vout: number;
    value: number;
    scriptpubkey?: string;
}

export interface IRuneUtxo {
    txid: string;
    vout: number;
    value: number;
    scriptpubkey: string;
    amount: number;
}

export interface IUTXO {
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

export interface ITXSTATUS {
    confirmed: boolean,
    block_height: number,
    block_hash: string,
    block_time: number
}
