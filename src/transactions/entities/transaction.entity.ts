import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';
import { Category } from './category.entity';
import { ImportBatch } from '../../import/entities/import-batch.entity';
import { DecimalTransformer } from '../../common/types/decimal.transformer';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  account!: Account;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  accountId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 255 })
  label!: string;

  // Positif = crédit (rentrée), négatif = débit (dépense).
  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: DecimalTransformer })
  amount!: number;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  category!: Category | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => ImportBatch, { nullable: true, onDelete: 'SET NULL' })
  importBatch!: ImportBatch | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  importBatchId!: string | null;

  // Référence bancaire unique de la transaction (colonne "Reference" des
  // exports CSV qui en fournissent une) — utilisée pour détecter les
  // doublons lors d'une réimportation qui chevaucherait un import
  // précédent. null si le format source n'a pas de référence exploitable
  // (repli sur date+libellé+montant dans ce cas, voir ImportService).
  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  externalRef!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
