import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
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

  @Patch(':id')
  update(@AuthUser() userId: string, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(userId, id, dto);
  }
}
