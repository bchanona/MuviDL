import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './infrastructure/routes/routes';
import { taskStore } from './infrastructure/worker/TaskStore';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

//Main route
app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'MuviDL API is running' });
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Keep awake (ping every 5 min from Android)
app.get('/ping', (_req: Request, res: Response) => {
  taskStore.cleanup();
  res.json({ status: 'ok', tasks: taskStore.getAllTasks().length });
});

//
app.use('/api/v1', routes); 

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
