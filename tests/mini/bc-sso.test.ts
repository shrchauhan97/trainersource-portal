import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  buildBcLoginJwt,
  buildBcLoginUrl,
  BcSsoConfig,
} from '../../src/lib/bc-sso.js';

const cfg: BcSsoConfig = {
  clientId: 'test_client_id',
  clientSecret: 'test_client_secret_long_enough_for_hs256',
  storeHash: 'yemcm3khpa',
  storeUrl: 'https://ultimate-peptides.com',
};

describe('buildBcLoginJwt', () => {
  it('produces an HS256 JWT with the required payload shape', () => {
    const token = buildBcLoginJwt(cfg, 12345, '/cart.php');
    const decoded = jwt.verify(token, cfg.clientSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    expect(decoded.iss).toBe('test_client_id');
    expect(decoded.operation).toBe('customer_logon');
    expect(decoded.store_hash).toBe('yemcm3khpa');
    expect(decoded.customer_id).toBe(12345);
    expect(decoded.redirect_to).toBe('/cart.php');
    expect(typeof decoded.iat).toBe('number');
    expect(typeof decoded.jti).toBe('string');
    expect(decoded.jti!.length).toBeGreaterThan(10);
  });

  it('produces a different jti on each call', () => {
    const a = buildBcLoginJwt(cfg, 12345);
    const b = buildBcLoginJwt(cfg, 12345);
    const decodedA = jwt.decode(a) as jwt.JwtPayload;
    const decodedB = jwt.decode(b) as jwt.JwtPayload;
    expect(decodedA.jti).not.toBe(decodedB.jti);
  });

  it('omits redirect_to when not provided', () => {
    const token = buildBcLoginJwt(cfg, 12345);
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    expect(decoded.redirect_to).toBeUndefined();
  });

  it('rejects tampered tokens when verified', () => {
    const token = buildBcLoginJwt(cfg, 12345);
    const [h, p, s] = token.split('.');
    const tampered = `${h}.${p}xx.${s}`;
    expect(() =>
      jwt.verify(tampered, cfg.clientSecret, { algorithms: ['HS256'] }),
    ).toThrow();
  });
});

describe('buildBcLoginUrl', () => {
  it('wraps the JWT in the canonical BC login URL', () => {
    const url = buildBcLoginUrl(cfg, 12345, '/cart.php');
    expect(url.startsWith('https://ultimate-peptides.com/login/token/')).toBe(
      true,
    );
    const token = url.replace(
      'https://ultimate-peptides.com/login/token/',
      '',
    );
    const decoded = jwt.verify(token, cfg.clientSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    expect(decoded.customer_id).toBe(12345);
  });
});
