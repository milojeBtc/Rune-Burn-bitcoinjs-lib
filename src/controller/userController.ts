import { Request, Response } from 'express';
import { burnAndTransfer, pre_transfer } from './transfer';

export const signPsbt = async (req: Request, res: Response) => {

  const { pubkey, accounts, feeRate, burningAmount } = req.body;

  const psbt = await pre_transfer(accounts[0], burningAmount, pubkey, feeRate)

  res.json({ success: true, psbt: psbt });
};

export const burnPsbt = async (req: Request, res: Response) => {
  const { signedPsbt, psbt } = req.body;

  await burnAndTransfer(signedPsbt, psbt);

  res.json({ succss: true })
}