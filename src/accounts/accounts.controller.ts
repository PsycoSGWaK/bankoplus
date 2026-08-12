import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../common/decorators/auth-user.decorator';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  create(@AuthUser() userId: string, @Body() dto: CreateAccountDto) {
    return this.accounts.create(userId, dto);
  }

  @Get()
  findAll(@AuthUser() userId: string) {
    return this.accounts.findAllForUser(userId);
  }
}
