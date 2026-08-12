import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { ImportService } from './import.service';
import { ImportFileDto } from './dto/import-file.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../common/decorators/auth-user.decorator';

const ALLOWED_EXTENSIONS = ['csv', 'pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

@Controller('import')
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      // Jamais écrit sur disque : le buffer ne vit qu'en mémoire, le temps
      // de la requête, puis est libéré par le ramasse-miettes.
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        const extension = file.originalname.split('.').pop()?.toLowerCase();
        if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
          callback(new BadRequestException('Seuls les fichiers .csv et .pdf sont acceptés'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  importFile(
    @AuthUser() userId: string,
    @Body() dto: ImportFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu');
    }
    return this.importService.importFile(userId, dto.accountId, file);
  }
}
