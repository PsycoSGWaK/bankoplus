import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategoryRuleAmountGuard1786873331436 implements MigrationInterface {
    name = 'AddCategoryRuleAmountGuard1786873331436'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`category_rules\` ADD \`minAmount\` decimal(10,2) NULL`);
        await queryRunner.query(`ALTER TABLE \`category_rules\` ADD \`direction\` varchar(6) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`category_rules\` DROP COLUMN \`direction\``);
        await queryRunner.query(`ALTER TABLE \`category_rules\` DROP COLUMN \`minAmount\``);
    }

}
