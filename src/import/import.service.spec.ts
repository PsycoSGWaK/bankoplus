import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ImportService } from './import.service';
import { AccountsService } from '../accounts/accounts.service';
import { AntivirusService } from './services/antivirus.service';
import { ParsingService } from './services/parsing.service';

function fileOf(name: string, size = 100) {
  return { originalname: name, buffer: Buffer.from('x'.repeat(size)), size };
}

describe('ImportService', () => {
  let service: ImportService;
  let accounts: { assertOwnership: jest.Mock };
  let antivirus: { assertClean: jest.Mock };
  let parsing: { parse: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    accounts = { assertOwnership: jest.fn().mockResolvedValue({ id: 'acc-1' }) };
    antivirus = { assertClean: jest.fn().mockResolvedValue(undefined) };
    parsing = { parse: jest.fn() };
    manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn((data) => Promise.resolve(Array.isArray(data) ? data : { ...data, id: 'batch-1' })),
    };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };

    const module = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: AccountsService, useValue: accounts },
        { provide: AntivirusService, useValue: antivirus },
        { provide: ParsingService, useValue: parsing },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(ImportService);
  });

  it('rejects unsupported file extensions before touching the antivirus or the parser', async () => {
    await expect(service.importFile('u1', 'acc-1', fileOf('releve.txt'))).rejects.toThrow(
      BadRequestException,
    );
    expect(antivirus.assertClean).not.toHaveBeenCalled();
    expect(parsing.parse).not.toHaveBeenCalled();
  });

  it('rejects files over the size limit', async () => {
    await expect(
      service.importFile('u1', 'acc-1', fileOf('releve.csv', 11 * 1024 * 1024)),
    ).rejects.toThrow(BadRequestException);
  });

  it('propagates ownership failures from AccountsService', async () => {
    accounts.assertOwnership.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.importFile('u1', 'acc-2', fileOf('releve.csv'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('marks the batch as completed when every row parses successfully', async () => {
    parsing.parse.mockResolvedValueOnce({
      rows: [{ date: '2026-08-03', label: 'X', amount: -10 }],
      totalRows: 1,
      failedRows: 0,
    });

    const batch = await service.importFile('u1', 'acc-1', fileOf('releve.csv'));
    expect(batch.status).toBe('completed');
    expect(batch.importedRows).toBe(1);
  });

  it('marks the batch as partial when some rows fail to parse', async () => {
    parsing.parse.mockResolvedValueOnce({
      rows: [{ date: '2026-08-03', label: 'X', amount: -10 }],
      totalRows: 2,
      failedRows: 1,
    });

    const batch = await service.importFile('u1', 'acc-1', fileOf('releve.csv'));
    expect(batch.status).toBe('partial');
  });

  it('marks the batch as failed when nothing could be parsed, without throwing', async () => {
    parsing.parse.mockResolvedValueOnce({ rows: [], totalRows: 3, failedRows: 3 });

    const batch = await service.importFile('u1', 'acc-1', fileOf('releve.csv'));
    expect(batch.status).toBe('failed');
    expect(manager.save).toHaveBeenCalledTimes(1); // le batch, mais aucune transaction
  });
});
