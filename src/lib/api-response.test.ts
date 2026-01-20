/**
 * Tests for API response helper functions.
 */

import { errorResponse, successResponse } from './api-response';

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}));

describe('errorResponse', () => {
  it('returns error with default status 400', () => {
    const response = errorResponse('Something went wrong');

    expect(response.body).toEqual({
      success: false,
      error: 'Something went wrong',
    });
    expect(response.status).toBe(400);
  });

  it('returns error with custom status', () => {
    const response = errorResponse('Not found', 404);

    expect(response.body).toEqual({
      success: false,
      error: 'Not found',
    });
    expect(response.status).toBe(404);
  });

  it('includes details when provided', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const response = errorResponse('Validation failed', 400, details);

    expect(response.body).toEqual({
      success: false,
      error: 'Validation failed',
      details: { field: 'email', reason: 'invalid format' },
    });
  });

  it('omits details when undefined', () => {
    const response = errorResponse('Error', 500, undefined);

    expect(response.body).toEqual({
      success: false,
      error: 'Error',
    });
    expect(response.body).not.toHaveProperty('details');
  });

  it('handles null details as a valid value', () => {
    const response = errorResponse('Error', 400, null);

    expect(response.body).toEqual({
      success: false,
      error: 'Error',
      details: null,
    });
  });

  it('returns 500 for server errors', () => {
    const response = errorResponse('Internal server error', 500);

    expect(response.status).toBe(500);
  });
});

describe('successResponse', () => {
  it('returns data with default status 200', () => {
    const data = { message: 'Success' };
    const response = successResponse(data);

    expect(response.body).toEqual({ message: 'Success' });
    expect(response.status).toBe(200);
  });

  it('returns data with custom status', () => {
    const data = { id: '123' };
    const response = successResponse(data, 201);

    expect(response.body).toEqual({ id: '123' });
    expect(response.status).toBe(201);
  });

  it('handles null data', () => {
    const response = successResponse(null);

    expect(response.body).toBe(null);
    expect(response.status).toBe(200);
  });

  it('handles array data', () => {
    const data = [1, 2, 3];
    const response = successResponse(data);

    expect(response.body).toEqual([1, 2, 3]);
  });

  it('handles primitive data', () => {
    const response = successResponse('plain string');

    expect(response.body).toBe('plain string');
  });

  it('handles nested objects', () => {
    const data = {
      user: { id: 1, name: 'Test' },
      items: [{ a: 1 }, { b: 2 }],
    };
    const response = successResponse(data);

    expect(response.body).toEqual(data);
  });
});
