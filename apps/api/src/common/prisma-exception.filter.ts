import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { FastifyReply } from "fastify";

/**
 * Global exception filter. Maps Prisma errors to correct HTTP status codes
 * (so a missing record returns 404, not a leaked 500) and shapes every error
 * into a consistent JSON envelope. HttpExceptions pass through untouched;
 * anything truly unexpected becomes a clean 500 with the detail logged, never
 * echoed to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const req = host.switchToHttp().getRequest<{ method?: string; url?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === "string") {
        message = res;
      } else if (res && typeof res === "object") {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        // preserve fields like retryAfterSeconds from the rate-limit guard
        const { statusCode: _sc, message: _m, ...rest } = body;
        extra = rest;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case "P2025": // record not found
          status = HttpStatus.NOT_FOUND;
          message = "The requested record was not found.";
          break;
        case "P2002": // unique constraint
          status = HttpStatus.CONFLICT;
          message = "That value is already in use.";
          break;
        case "P2003": // FK constraint
          status = HttpStatus.BAD_REQUEST;
          message = "Invalid reference — a related record does not exist.";
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = "Database request could not be completed.";
      }
      this.log.warn(`Prisma ${exception.code} on ${req?.method} ${req?.url}`);
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = "Invalid data sent to the database.";
    } else {
      // Unknown / unexpected — log the real error, return a generic message.
      this.log.error(
        `Unhandled error on ${req?.method} ${req?.url}: ${
          exception instanceof Error ? exception.stack : String(exception)
        }`,
      );
    }

    reply.status(status).send({
      statusCode: status,
      message,
      ...extra,
      timestamp: new Date().toISOString(),
    });
  }
}
