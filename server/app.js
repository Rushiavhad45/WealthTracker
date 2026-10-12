import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { allowedOrigins } from './config/env.js';
import authRoutes from './routes/auth.js';
import investmentRoutes from './routes/investments.js';
import portfolioRoutes from './routes/portfolio.js';
import priceRoutes from './routes/prices.js';
import taxRoutes from './routes/tax.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Needed for correct client IPs (rate limiting) when behind a proxy / load balancer.
  const proxy = process.env.TRUST_PROXY;
  if (proxy && proxy !== '0') app.set('trust proxy', /^\d+$/.test(proxy) ? Number(proxy) : proxy);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins() }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/investments', investmentRoutes);
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api/prices', priceRoutes);
  app.use('/api/tax', taxRoutes);

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
