import { Card } from "../types";

export class CardDataService {
  generateMockCards(count: number = 5): Card[] {
    const cards: Card[] = [];
    for (let i = 0; i < count; i++) {
      cards.push({
        id: `card-${i + 1}`,
        title: `Virtual Card ${i + 1}`,
        expirationDate: `${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}/${Math.floor(Math.random() * (30 - 23) + 23)}`,
        amount: Math.floor(Math.random() * 10000) / 100, // Random amount between 0 and 100
      });
    }
    return cards;
  }
}