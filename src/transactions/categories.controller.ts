import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCategoryRuleDto } from './dto/create-category-rule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../common/decorators/auth-user.decorator';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@AuthUser() userId: string) {
    return this.categories.list(userId);
  }

  @Post()
  create(@AuthUser() userId: string, @Body() dto: CreateCategoryDto) {
    return this.categories.create(userId, dto);
  }

  @Delete(':id')
  remove(@AuthUser() userId: string, @Param('id') id: string) {
    return this.categories.remove(userId, id);
  }

  @Get(':id/rules')
  listRules(@AuthUser() userId: string, @Param('id') id: string) {
    return this.categories.listRules(userId, id);
  }

  @Post(':id/rules')
  addRule(@AuthUser() userId: string, @Param('id') id: string, @Body() dto: CreateCategoryRuleDto) {
    return this.categories.addRule(userId, id, dto);
  }

  @Delete('rules/:ruleId')
  removeRule(@AuthUser() userId: string, @Param('ruleId') ruleId: string) {
    return this.categories.removeRule(userId, ruleId);
  }
}
