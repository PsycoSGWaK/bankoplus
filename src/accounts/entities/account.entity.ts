import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  // Libellé libre choisi par l'utilisateur (ex. "Compte courant") —
  // jamais de RIB, IBAN, BIC ou identifiant de connexion bancaire ici.
  @Column({ type: 'varchar', length: 100 })
  label!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankName!: string | null;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
