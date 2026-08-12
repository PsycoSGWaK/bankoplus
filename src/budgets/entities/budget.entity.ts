import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DecimalTransformer } from '../../common/types/decimal.transformer';

@Entity('budgets')
@Index(['userId', 'categoryId'], { unique: true })
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  // null = seuil global, appliqué à l'ensemble des dépenses du mois.
  @Column({ type: 'varchar', length: 36, nullable: true })
  categoryId!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: DecimalTransformer })
  monthlyLimit!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
