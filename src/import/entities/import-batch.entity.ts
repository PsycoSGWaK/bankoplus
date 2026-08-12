import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ImportBatchStatus = 'completed' | 'partial' | 'failed';
export type ImportSourceType = 'csv' | 'pdf';

@Entity('import_batches')
export class ImportBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  accountId!: string;

  // Métadonnées seulement — le fichier lui-même n'est jamais persisté,
  // ni sur disque ni en base (voir ParsingService : upload en mémoire uniquement).
  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 10 })
  sourceType!: ImportSourceType;

  @Column({ type: 'varchar', length: 10 })
  status!: ImportBatchStatus;

  @Column({ type: 'int' })
  totalRows!: number;

  @Column({ type: 'int' })
  importedRows!: number;

  @Column({ type: 'int' })
  failedRows!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
