import 'dotenv/config';
import { DataSource } from 'typeorm';

// Utilisé exclusivement par le CLI TypeORM (génération/exécution des
// migrations) — l'application elle-même se connecte via TypeOrmModule dans
// app.module.ts. Les deux doivent rester cohérents (mêmes entités, même
// connexion), mais celui-ci ne doit jamais activer `synchronize`.
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
