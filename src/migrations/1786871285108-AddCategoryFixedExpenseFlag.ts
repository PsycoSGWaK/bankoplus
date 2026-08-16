import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategoryFixedExpenseFlag1786871285108 implements MigrationInterface {
    name = 'AddCategoryFixedExpenseFlag1786871285108'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`categories\` ADD \`isFixedExpense\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`categories\` DROP COLUMN \`isFixedExpense\``);
    }

}
