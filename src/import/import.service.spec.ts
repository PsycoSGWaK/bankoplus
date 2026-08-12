import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ImportService } from './import.service';
import { AccountsService } from '../accounts/accounts.service';
import { AntivirusService } from './services/antivirus.service';
import { ParsingService } from './services/parsing.service';
import { CategorizationService } from '../transactions/categorization.service';

function fileOf(name: string, size = 100) {
  return { originalname: name, buffer: Buffer.from('x'.repeat(size)), size };
}

describe('ImportService', () => {
  let service: ImportService;
  let accounts: { assertOwnership: jest.Mock };
  let antivirus: { assertClean: jest.Mock };
  let parsing: { parse: jest.Mock };
  let categorization: { suggest: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    accounts = { assertOwnership: jest.fn().mockResolvedValue({ id: 'acc-1' }) };
    antivirus = { assertClean: jest.fn().mockResolvedValue(undefined) };
    parsing = { parse: jest.fn() };
    categorization = { suggest: jest.fn().mockResolvedValue('cat-fallback') };
    manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn((data) => Promise.resolve(Array.isArray(data) ? data : { ...data, id: 'batch-1' })),
      // Par défaut : aucune transaction existante en base pour ce compte
      // (ni référence connue, ni empreinte connue) — pas de doublon détecté.
      find: jest.fn().mockResolvedValue([]),
    };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };

    const module = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: AccountsService, useValue: accounts },
        { provide: AntivirusService, useValue: antivirus },
        { provide: ParsingService, useValue: parsing },
        { provide: CategorizationService, useValue: categorization },
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
    expect(categorization.suggest).not.toHaveBeenCalled();
  });

  it('runs auto-categorization for every imported row', async () => {
    parsing.parse.mockResolvedValueOnce({
      rows: [
        { date: '2026-08-03', label: 'CARREFOUR', amount: -10 },
        { date: '2026-08-01', label: 'VIREMENT SALAIRE', amount: 1500 },
      ],
      totalRows: 2,
      failedRows: 0,
    });

    await service.importFile('u1', 'acc-1', fileOf('releve.csv'));

    expect(categorization.suggest).toHaveBeenCalledWith('u1', 'CARREFOUR', -10);
    expect(categorization.suggest).toHaveBeenCalledWith('u1', 'VIREMENT SALAIRE', 1500);
  });

  describe('déduplication', () => {
    it('skips a row whose bank reference already exists for this account', async () => {
      parsing.parse.mockResolvedValueOnce({
        rows: [{ date: '2026-08-03', label: 'CARREFOUR', amount: -10, externalRef: 'REF-42' }],
        totalRows: 1,
        failedRows: 0,
      });
      manager.find
        .mockResolvedValueOnce([{ externalRef: 'REF-42' }]) // refs déjà connues
        .mockResolvedValueOnce([]); // empreintes déjà connues

      const batch = await service.importFile('u1', 'acc-1', fileOf('releve.csv'));

      expect(batch.importedRows).toBe(0);
      expect(batch.duplicateRows).toBe(1);
      expect(categorization.suggest).not.toHaveBeenCalled();
    });

    it('falls back to date+label+amount when a row has no bank reference', async () => {
      parsing.parse.mockResolvedValueOnce({
        rows: [{ date: '2026-08-03', label: 'CARREFOUR MARKET', amount: -45.67 }],
        totalRows: 1,
        failedRows: 0,
      });
      manager.find
        .mockResolvedValueOnce([]) // pas de référence connue
        .mockResolvedValueOnce([{ date: '2026-08-03', label: 'CARREFOUR MARKET', amount: -45.67 }]);

      const batch = await service.importFile('u1', 'acc-1', fileOf('releve.csv'));

      expect(batch.importedRows).toBe(0);
      expect(batch.duplicateRows).toBe(1);
    });

    it('imports a row normally when nothing matches an existing transaction', async () => {
      parsing.parse.mockResolvedValueOnce({
        rows: [{ date: '2026-08-03', label: 'NOUVELLE DEPENSE', amount: -12 }],
        totalRows: 1,
        failedRows: 0,
      });

      const batch = await service.importFile('u1', 'acc-1', fileOf('releve.csv'));

      expect(batch.importedRows).toBe(1);
      expect(batch.duplicateRows).toBe(0);
    });

    it('does not import the same row twice if it is repeated within the same file', async () => {
      parsing.parse.mockResolvedValueOnce({
        rows: [
          { date: '2026-08-03', label: 'CARREFOUR', amount: -10, externalRef: 'REF-1' },
          { date: '2026-08-03', label: 'CARREFOUR', amount: -10, externalRef: 'REF-1' },
        ],
        totalRows: 2,
        failedRows: 0,
      });

      const batch = await service.importFile('u1', 'acc-1', fileOf('releve.csv'));

      expect(batch.importedRows).toBe(1);
      expect(batch.duplicateRows).toBe(1);
    });
  });
});
