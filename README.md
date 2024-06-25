The Rune Burn Project.

1. Transfer claim amount of rune token from User wallet to Receiver wallet. 

    - Get rune utxos and btc utxos in user wallet.

    - Build PSBT with user rune token and utxo balance as input and OP_RETURN value and claim amount of rune token, return rune token, change utxo as output using user wallet publickey, address, and receiver wallet address.

    - Send and Sign PSBT with user wallet.


2. After confirmed transaction, Transfer and Burn rune token from Receiver wallet to Burning wallet.

    - Get rune utxos and btc utxos in receiver wallet.

    - Build PSBT with receiver rune token and utxo balance as input and OP_RETURN value and claim amount of rune token, return rune token, change utxo as output using reciver wallet WIF privatekey, address, and burning wallet address.
    (At that time, set OP_RETURN as invalid)

    - Sign PSBT with receiver wallet.


P.S. All necessary values are in network.config.ts.
