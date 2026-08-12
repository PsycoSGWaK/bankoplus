import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

function repoMock() {
  return { findOne: jest.fn(), save: jest.fn((x) => x) };
}

describe('TransactionsService.assignCategory', () => {
  let service: TransactionsService;
  let transactions: ReturnType<typeof repoMock>;
  let categorization: { assertVisible: jest.Mock };

  beforeEach(() => {
    transactions = repoMock();
    categorization = { assertVisible: jest.fn().mockResolvedValue(undefined) };
    service = new TransactionsService(transactions as any, categorization as any);
  });

  it('rejects assigning a category on a transaction owned by someone else', async () => {
    transactions.findOne.mockResolvedValueOnce({ id: 't1', userId: 'someone-else' });
    await expect(service.assignCategory('u1', 't1', 'cat-1')).rejects.toThrow(ForbiddenException);
  });

  it('throws when the transaction does not exist', async () => {
    transactions.findOne.mockResolvedValueOnce(null);
    await expect(service.assignCategory('u1', 'missing', 'cat-1')).rejects.toThrow(NotFoundException);
  });

  it('validates the target category is visible to the user before assigning it', async () => {
    transactions.findOne.mockResolvedValueOnce({ id: 't1', userId: 'u1', categoryId: null });
    await service.assignCategory('u1', 't1', 'cat-1');
    expect(categorization.assertVisible).toHaveBeenCalledWith('u1', 'cat-1');
  });

  it('allows clearing the category without a visibility check', async () => {
    transactions.findOne.mockResolvedValueOnce({ id: 't1', userId: 'u1', categoryId: 'cat-1' });
    const result = await service.assignCategory('u1', 't1', null);
    expect(categorization.assertVisible).not.toHaveBeenCalled();
    expect(result.categoryId).toBeNull();
  });
});
