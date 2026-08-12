import { Matches } from 'class-validator';

export class TotpCodeDto {
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir exactement 6 chiffres' })
  code!: string;
}
