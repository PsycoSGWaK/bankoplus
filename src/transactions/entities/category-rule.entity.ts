import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from './category.entity';

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

  @CreateDateColumn()
  createdAt!: Date;
}
