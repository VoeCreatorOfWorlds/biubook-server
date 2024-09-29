import { Request, Response } from 'express';
import { CardApiService } from './services/cardApiService';
import { CardsRequest } from './types';

export async function getCardsHandler(req: Request, res: Response): Promise<void> {
  const { count } = req.query as CardsRequest;
  const cardApiService = new CardApiService();

  try {
    const result = await cardApiService.getCards({ count: count ? Number(count) : undefined });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function getCardByIdHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const cardApiService = new CardApiService();

  try {
    const result = await cardApiService.getCardById(id);
    if (result) {
      res.json(result);
    } else {
      res.status(404).json({ error: 'Card not found' });
    }
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
}