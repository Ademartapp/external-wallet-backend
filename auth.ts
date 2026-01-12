import { Request, Response, NextFunction } from 'express';

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ 
      success: false, 
      error: 'Missing or invalid authorization header' 
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  
  if (token !== process.env.WALLET_BACKEND_TOKEN) {
    res.status(403).json({ 
      success: false, 
      error: 'Invalid token' 
    });
    return;
  }

  next();
};
