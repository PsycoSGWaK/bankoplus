import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExternalRefAndDuplicateTracking1786576720089 implements MigrationInterface {
    name = 'AddExternalRefAndDuplicateTracking1786576720089'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`import_batches\` ADD \`duplicateRows\` int NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`transactions\` ADD \`externalRef\` varchar(100) NULL`);
        await queryRunner.query(`CREATE INDEX \`IDX_75c9aaf7392d3c7812afe5b636\` ON \`transactions\` (\`externalRef\`)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_75c9aaf7392d3c7812afe5b636\` ON \`transactions\``);
        await queryRunner.query(`ALTER TABLE \`transactions\` DROP COLUMN \`externalRef\``);
        await queryRunner.query(`ALTER TABLE \`import_batches\` DROP COLUMN \`duplicateRows\``);
    }

}
