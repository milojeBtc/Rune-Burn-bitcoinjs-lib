import app from './app';
import dotenv from 'dotenv';
import useRouter from './routes/userRoutes';

dotenv.config();

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
