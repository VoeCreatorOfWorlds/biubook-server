import { ExpenseCheck, ExpenseLLMCheckCall } from './types';
import { JSDOM } from 'jsdom';

export class ExpenseCheckClass implements ExpenseCheck {
  body: string;
  chunks: string[];

  constructor(body: string) {
    this.body = body;
    this.chunks = [];
  }

  createChunks(): void {
    const chunkSize = 1000;
    for (let i = 0; i < this.body.length; i += chunkSize) {
      this.chunks.push(this.body.slice(i, i + chunkSize));
    }
  }

  getChunks(): string[] {
    return this.chunks;
  }
}

export class ExpenseLLMCheckCallClass implements ExpenseLLMCheckCall {
  data: string;
  apiURL: string;
  cleanData: string;

  constructor(data: string, apiURL: string) {
    this.data = data;
    this.apiURL = apiURL;
    this.cleanData = '';
  }

  async getClean(): Promise<string> {
    const dom = new JSDOM(this.data);
    const { document } = dom.window;

    document.querySelectorAll('script, style').forEach(el => el.remove());
    document.querySelectorAll('*').forEach(el => el.removeAttribute('class'));

    const text = document.body.textContent || '';
    return text.trim();
  }
}