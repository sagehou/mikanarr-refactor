import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('Error:', err);
  res.status(500).send(err.message || 'Internal server error');
}
