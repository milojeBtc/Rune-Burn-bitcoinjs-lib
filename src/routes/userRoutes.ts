import { Router } from 'express';
import { burnPsbt, signPsbt } from '../controller/userController';

const useRouter = Router();

useRouter.post('/signPsbt', signPsbt);
useRouter.post('/burnPsbt', burnPsbt);

export default useRouter;
