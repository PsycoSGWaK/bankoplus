import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type CategoryKind = 'income' | 'expense';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60 })
  name!: string;

  @Column({ type: 'varchar', length: 10 })
  kind!: CategoryKind;
}
