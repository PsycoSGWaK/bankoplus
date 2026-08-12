import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CategoryKind = 'income' | 'expense';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60 })
  name!: string;

  @Column({ type: 'varchar', length: 10 })
  kind!: CategoryKind;

  // null = catégorie par défaut, visible par tous les utilisateurs.
  // renseigné = catégorie personnalisée, propre à cet utilisateur.
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  userId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
