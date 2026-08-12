import { IsEmail, Matches, MaxLength, MinLength } from 'class-validator';

// Au moins une minuscule, une majuscule, un chiffre et un caractère spécial.
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).+$/;

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @MinLength(12, { message: 'Le mot de passe doit contenir au moins 12 caractères' })
  @MaxLength(128)
  @Matches(PASSWORD_POLICY, {
    message: 'Le mot de passe doit contenir une minuscule, une majuscule, un chiffre et un caractère spécial',
  })
  password!: string;
}
