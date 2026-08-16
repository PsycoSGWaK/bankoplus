import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from './category.entity';
import { DecimalTransformer } from '../../common/types/decimal.transformer';

@Entity('category_rules')
export class CategoryRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  category!: Category;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  categoryId!: string;

  // Mot-clé normalisé (majuscules, sans accents) recherché dans le libellé
  // de la transaction.
  @Column({ type: 'varchar', length: 60 })
  keyword!: string;

  // null = règle système (issue du seed par défaut), appliquée à tous.
  // renseigné = règle personnelle créée par l'utilisateur.
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  userId!: string | null;

  // Garde optionnelle en plus du mot-clé : utile quand un même libellé (ex:
  // le nom abrégé de sa propre banque) désigne des mouvements différents
  // selon le montant/le sens — typiquement un déblocage de prêt (crédit,
  // gros montant) vs un prélèvement de gestion de compte (petit montant).
  // Absent = pas de contrainte sur ce critère.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: DecimalTransformer })
  minAmount!: number | null;

  @Column({ type: 'varchar', length: 6, nullable: true })
  direction!: 'credit' | 'debit' | null;

  @CreateDateColumn()
  createdAt!: Date;
}
