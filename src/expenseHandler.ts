import { Request, Response } from 'express';
import { ExpenseCheckClass, ExpenseLLMCheckCallClass, } from './expenseCheck';
import { ExpenseCheckRequest, ExpenseCheck } from './types';

export async function checkExpenseHandler(req: Request, res: Response): Promise<void> {
  const { body } = req.body as ExpenseCheckRequest;

  const expenseCall = new ExpenseLLMCheckCallClass(body, process.env.API_URL || '');

  try {
    const result = await validateExpense(expenseCall);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
}

async function validateExpense(e: ExpenseLLMCheckCallClass): Promise<ExpenseCheck> {
  try {
    const cleanData = await e.getClean();
    const expenseCheck = new ExpenseCheckClass(cleanData);

    if (cleanData.length > 1000) {
      expenseCheck.createChunks();
    }

    console.log(`Would send chunks to API at: ${e.apiURL}`);

    return expenseCheck;
  } catch (error) {
    console.error('Error cleaning data:', error);
    return new ExpenseCheckClass('Error cleaning data');
  }
}