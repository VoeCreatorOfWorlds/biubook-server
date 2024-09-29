import { Card, CardsRequest } from '../types';
import { CardDataService } from './cardDataService';

export class CardApiService {
  private dataService: CardDataService;

  constructor() {
    this.dataService = new CardDataService();
  }

  async getCards(request: CardsRequest): Promise<Card[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return this.dataService.generateMockCards(request.count);
  }

  async getCardById(id: string): Promise<Card | null> {
    const cards = this.dataService.generateMockCards();
    return cards.find(card => card.id === id) || null;
  }
}