import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { PasswordService } from './password.service';

/** Global · 어디서든 주입 가능. Team / TeamContext / Migration 등에서 사용. */
@Global()
@Module({
  providers: [EncryptionService, PasswordService],
  exports: [EncryptionService, PasswordService],
})
export class CryptoModule {}
