import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * One recipient device's ciphertext for a single E2EE message. `ciphertext`
 * is an opaque, client-serialized envelope (see packages/e2ee/src/session.ts's
 * Envelope type) — the server never parses it, only stores and relays it.
 */
export class MessageCipherDto {
  @ApiProperty({ description: "Recipient device's owner — deviceId strings are only unique per user, not globally, so this is required to resolve the right Device row" })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: "Recipient device's client-generated deviceId" })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({ description: 'Opaque JSON-serialized E2EE envelope' })
  @IsString()
  @IsNotEmpty()
  ciphertext: string;
}
