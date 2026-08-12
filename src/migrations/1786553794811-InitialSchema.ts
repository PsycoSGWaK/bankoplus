import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1786553794811 implements MigrationInterface {
    name = 'InitialSchema1786553794811'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`accounts\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`label\` varchar(100) NOT NULL, \`bankName\` varchar(100) NULL, \`currency\` varchar(3) NOT NULL DEFAULT 'EUR', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_3aa23c0a6d107393e8b40e3e2a\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`categories\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(60) NOT NULL, \`kind\` varchar(10) NOT NULL, \`userId\` varchar(36) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_13e8b2a21988bec6fdcbb1fa74\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`import_batches\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`accountId\` varchar(36) NOT NULL, \`filename\` varchar(255) NOT NULL, \`sourceType\` varchar(10) NOT NULL, \`status\` varchar(10) NOT NULL, \`totalRows\` int NOT NULL, \`importedRows\` int NOT NULL, \`failedRows\` int NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_c5ad7102803c6170805d87c8af\` (\`userId\`), INDEX \`IDX_369f6fdcc51f396f6519ea12d2\` (\`accountId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`transactions\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`accountId\` varchar(36) NOT NULL, \`date\` date NOT NULL, \`label\` varchar(255) NOT NULL, \`amount\` decimal(12,2) NOT NULL, \`categoryId\` varchar(36) NULL, \`importBatchId\` varchar(36) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_6bb58f2b6e30cb51a6504599f4\` (\`userId\`), INDEX \`IDX_26d8aec71ae9efbe468043cd2b\` (\`accountId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`users\` (\`id\` varchar(36) NOT NULL, \`email\` varchar(255) NOT NULL, \`passwordHash\` varchar(255) NOT NULL, \`mfaEnabled\` tinyint NOT NULL DEFAULT 0, \`mfaSecretEncrypted\` text NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`budgets\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`categoryId\` varchar(36) NULL, \`monthlyLimit\` decimal(12,2) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_27e688ddf1ff3893b43065899f\` (\`userId\`), UNIQUE INDEX \`IDX_1f83c5effbdb051c3fd9208b9c\` (\`userId\`, \`categoryId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`category_rules\` (\`id\` varchar(36) NOT NULL, \`categoryId\` varchar(36) NOT NULL, \`keyword\` varchar(60) NOT NULL, \`userId\` varchar(36) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_e4d39af501fcf22258179d0cc8\` (\`categoryId\`), INDEX \`IDX_eb50e3f1af1a537ee818c2ca68\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`refresh_tokens\` (\`id\` varchar(36) NOT NULL, \`jti\` varchar(36) NOT NULL, \`family\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`revoked\` tinyint NOT NULL DEFAULT 0, \`expiresAt\` datetime NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_f3752400c98d5c0b3dca54d66d\` (\`jti\`), INDEX \`IDX_968936751ab847471635be8dc0\` (\`family\`), INDEX \`IDX_610102b60fea1455310ccd299d\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD CONSTRAINT \`FK_26d8aec71ae9efbe468043cd2b9\` FOREIGN KEY (\`accountId\`) REFERENCES \`accounts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD CONSTRAINT \`FK_86e965e74f9cc66149cf6c90f64\` FOREIGN KEY (\`categoryId\`) REFERENCES \`categories\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD CONSTRAINT \`FK_9ad64beff44260ccb82fa1f17f2\` FOREIGN KEY (\`importBatchId\`) REFERENCES \`import_batches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`category_rules\` ADD CONSTRAINT \`FK_e4d39af501fcf22258179d0cc85\` FOREIGN KEY (\`categoryId\`) REFERENCES \`categories\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` ADD CONSTRAINT \`FK_610102b60fea1455310ccd299de\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` DROP FOREIGN KEY \`FK_610102b60fea1455310ccd299de\``);
        await queryRunner.query(`ALTER TABLE \`category_rules\` DROP FOREIGN KEY \`FK_e4d39af501fcf22258179d0cc85\``);
        await queryRunner.query(`ALTER TABLE \`transactions\` DROP FOREIGN KEY \`FK_9ad64beff44260ccb82fa1f17f2\``);
        await queryRunner.query(`ALTER TABLE \`transactions\` DROP FOREIGN KEY \`FK_86e965e74f9cc66149cf6c90f64\``);
        await queryRunner.query(`ALTER TABLE \`transactions\` DROP FOREIGN KEY \`FK_26d8aec71ae9efbe468043cd2b9\``);
        await queryRunner.query(`DROP INDEX \`IDX_610102b60fea1455310ccd299d\` ON \`refresh_tokens\``);
        await queryRunner.query(`DROP INDEX \`IDX_968936751ab847471635be8dc0\` ON \`refresh_tokens\``);
        await queryRunner.query(`DROP INDEX \`IDX_f3752400c98d5c0b3dca54d66d\` ON \`refresh_tokens\``);
        await queryRunner.query(`DROP TABLE \`refresh_tokens\``);
        await queryRunner.query(`DROP INDEX \`IDX_eb50e3f1af1a537ee818c2ca68\` ON \`category_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_e4d39af501fcf22258179d0cc8\` ON \`category_rules\``);
        await queryRunner.query(`DROP TABLE \`category_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_1f83c5effbdb051c3fd9208b9c\` ON \`budgets\``);
        await queryRunner.query(`DROP INDEX \`IDX_27e688ddf1ff3893b43065899f\` ON \`budgets\``);
        await queryRunner.query(`DROP TABLE \`budgets\``);
        await queryRunner.query(`DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_26d8aec71ae9efbe468043cd2b\` ON \`transactions\``);
        await queryRunner.query(`DROP INDEX \`IDX_6bb58f2b6e30cb51a6504599f4\` ON \`transactions\``);
        await queryRunner.query(`DROP TABLE \`transactions\``);
        await queryRunner.query(`DROP INDEX \`IDX_369f6fdcc51f396f6519ea12d2\` ON \`import_batches\``);
        await queryRunner.query(`DROP INDEX \`IDX_c5ad7102803c6170805d87c8af\` ON \`import_batches\``);
        await queryRunner.query(`DROP TABLE \`import_batches\``);
        await queryRunner.query(`DROP INDEX \`IDX_13e8b2a21988bec6fdcbb1fa74\` ON \`categories\``);
        await queryRunner.query(`DROP TABLE \`categories\``);
        await queryRunner.query(`DROP INDEX \`IDX_3aa23c0a6d107393e8b40e3e2a\` ON \`accounts\``);
        await queryRunner.query(`DROP TABLE \`accounts\``);
    }

}
