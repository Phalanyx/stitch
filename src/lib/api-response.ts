import { NextResponse } from 'next/server';

/**
 * API response helpers for standardized response formats.
 * Ensures consistent error and success response structures across all API routes.
 */

/**
 * Create a standardized error response.
 * @param message - The error message to return to the client
 * @param status - HTTP status code (default: 400)
 * @param details - Optional additional error details
 * @returns NextResponse with standardized error format
 */
export function errorResponse(
  message: string,
  status: number = 400,
  details?: unknown
): NextResponse {
  const body: { success: false; error: string; details?: unknown } = {
    success: false,
    error: message,
  };

  if (details !== undefined) {
    body.details = details;
  }

  return NextResponse.json(body, { status });
}

/**
 * Create a standardized success response.
 * @param data - The data to return to the client
 * @param status - HTTP status code (default: 200)
 * @returns NextResponse with the data
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}
