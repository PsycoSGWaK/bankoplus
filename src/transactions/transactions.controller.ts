import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AssignCategoryDto } from './dto/assign-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../common/decorators/auth-user.decorator';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@AuthUser() userId: string, @Query('accountId') accountId?: string) {
    return this.transactions.findAllForUser(userId, accountId);
  }

  @Patch(':id/category')
  assignCategory(
    @AuthUser() userId: string,
    @Param('id') id: string,
    @Body() dto: AssignCategoryDto,
  ) {
    return this.transactions.assignCategory(userId, id, dto.categoryId ?? null);
  }
}
