import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DecimalTransformer } from '../../common/types/decimal.transformer';

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

  // Solde connu à une date donnée, saisi une fois par l'utilisateur quand
  // l'historique bancaire disponible ne remonte pas jusqu'au début du
  // compte. Le solde actuel se calcule alors comme
  // referenceBalance + somme des transactions dont la date est postérieure
  // ou égale à referenceDate. null tant que l'utilisateur ne l'a pas saisi
  // — dans ce cas le solde actuel est inconnu, pas zéro.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  referenceBalance!: number | null;

  @Column({ type: 'date', nullable: true })
  referenceDate!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
