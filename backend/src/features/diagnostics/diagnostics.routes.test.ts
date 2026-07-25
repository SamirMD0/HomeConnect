import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { diagnosticsService } from './diagnostics.service';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

vi.mock('./diagnostics.service', () => ({
  diagnosticsService: {
    getHealth: vi.fn(),
    getErrors: vi.fn(),
    clearErrors: vi.fn(),
  }
}));

const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';

const generateToken = (role: Role) => {
  return jwt.sign(
    { userId: 'test-user-id', username: 'testuser', role },
    jwtSecret,
    { expiresIn: '1h' }
  );
};

describe('Diagnostics API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/admin/diagnostics/health', () => {
    it('returns 401 without auth', async () => {
      const response = await request(app).get('/api/v1/admin/diagnostics/health');
      expect(response.status).toBe(401);
    });

    it('returns 403 for non-admin role', async () => {
      const token = generateToken(Role.EMPLOYEE);
      const response = await request(app)
        .get('/api/v1/admin/diagnostics/health')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(403);
    });

    it('returns health data for admin', async () => {
      const mockHealth = { status: 'healthy', database: 'connected', appVersion: '1.0.0', logPath: '/path' };
      vi.mocked(diagnosticsService.getHealth).mockResolvedValue(mockHealth);

      const token = generateToken(Role.ADMIN);
      const response = await request(app)
        .get('/api/v1/admin/diagnostics/health')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockHealth);
    });
  });

  describe('GET /api/v1/admin/diagnostics/errors', () => {
    it('returns error logs for admin', async () => {
      const mockErrors = [{ message: 'test error', timestamp: '2023-01-01', appVersion: '1.0.0' }];
      vi.mocked(diagnosticsService.getErrors).mockReturnValue(mockErrors);

      const token = generateToken(Role.ADMIN);
      const response = await request(app)
        .get('/api/v1/admin/diagnostics/errors')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockErrors);
      expect(diagnosticsService.getErrors).toHaveBeenCalledWith(20);
    });
  });

  describe('POST /api/v1/admin/diagnostics/clear-errors', () => {
    it('clears error logs for admin', async () => {
      const token = generateToken(Role.ADMIN);
      const response = await request(app)
        .post('/api/v1/admin/diagnostics/clear-errors')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(diagnosticsService.clearErrors).toHaveBeenCalled();
    });
  });
});
