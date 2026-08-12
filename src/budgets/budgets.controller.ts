import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';
import { SimulatePurchaseDto } from './dto/simulate-purchase.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../common/decorators/auth-user.decorator';

@Controller('budgets')
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post()
  upsert(@AuthUser() userId: string, @Body() dto: UpsertBudgetDto) {
    return this.budgets.upsert(userId, dto);
  }

  @Get()
  list(@AuthUser() userId: string, @Query('month') month?: string) {
    return this.budgets.list(userId, month);
  }

  @Delete(':id')
  remove(@AuthUser() userId: string, @Param('id') id: string) {
    return this.budgets.remove(userId, id);
  }

  @Get('overview')
  overview(@AuthUser() userId: string, @Query('month') month?: string) {
    return this.budgets.overview(userId, month);
  }

  @Post('simulate')
  simulate(@AuthUser() userId: string, @Body() dto: SimulatePurchaseDto) {
    return this.budgets.simulate(userId, dto);
  }
}
