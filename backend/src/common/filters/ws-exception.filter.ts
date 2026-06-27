import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch(WsException, Error)
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: WsException | Error, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();

    const message =
      exception instanceof WsException
        ? exception.getError()
        : (exception.message ?? 'Internal server error');

    const errorPayload =
      typeof message === 'string' ? { message } : (message as object);

    this.logger.error(
      `WebSocket exception on socket ${client.id}: ${JSON.stringify(errorPayload)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    client.emit('error', errorPayload);
  }
}
