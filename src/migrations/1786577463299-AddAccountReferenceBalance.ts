import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountReferenceBalance1786577463299 implements MigrationInterface {
    name = 'AddAccountReferenceBalance1786577463299'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`accounts\` ADD \`referenceBalance\` decimal(12,2) NULL`);
        await queryRunner.query(`ALTER TABLE \`accounts\` ADD \`referenceDate\` date NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`accounts\` DROP COLUMN \`referenceDate\``);
        await queryRunner.query(`ALTER TABLE \`accounts\` DROP COLUMN \`referenceBalance\``);
    }

}
