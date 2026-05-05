import { describe, expect, it } from 'vitest';
import {
  UPLOAD_SPECS,
  sanitiseExtension,
  validateUpload,
} from '@/app/onboarding/_lib/uploadValidation';

function makeFile(name: string, type: string, sizeBytes: number): File {
  // Buffer of zeros sized exactly. Avoids large allocations by reusing a
  // single Uint8Array.
  const data = new Uint8Array(sizeBytes);
  return new File([data], name, { type });
}

describe('sanitiseExtension', () => {
  it('returns null when no dot in filename', () => {
    expect(sanitiseExtension('noextension', ['pdf'])).toBeNull();
  });

  it('lowercases and matches against allowlist', () => {
    expect(sanitiseExtension('CERT.PDF', ['pdf'])).toBe('pdf');
  });

  it('strips non-alphanumeric chars to defeat null-byte tricks', () => {
    expect(sanitiseExtension('shell.php%00.pdf', ['pdf'])).toBe('pdf');
    expect(sanitiseExtension('shell.exe', ['pdf'])).toBeNull();
  });

  it('returns null for disallowed extensions', () => {
    expect(sanitiseExtension('image.svg', ['png', 'jpg'])).toBeNull();
  });
});

describe('validateUpload', () => {
  describe('qualification', () => {
    it('accepts a small PDF', () => {
      const result = validateUpload(makeFile('cert.pdf', 'application/pdf', 1024), 'qualification');
      expect(result).toEqual({ ok: true, extension: 'pdf' });
    });

    it('accepts a JPEG within size cap', () => {
      const result = validateUpload(makeFile('cert.jpg', 'image/jpeg', 1024), 'qualification');
      expect(result).toEqual({ ok: true, extension: 'jpg' });
    });

    it('rejects an SVG (XSS vector)', () => {
      const result = validateUpload(makeFile('attack.svg', 'image/svg+xml', 1024), 'qualification');
      expect(result.ok).toBe(false);
    });

    it('rejects executables disguised as images', () => {
      const result = validateUpload(makeFile('image.exe', 'application/octet-stream', 1024), 'qualification');
      expect(result.ok).toBe(false);
    });

    it('rejects files over the size cap', () => {
      const oversized = UPLOAD_SPECS.qualification.maxBytes + 1;
      const result = validateUpload(makeFile('big.pdf', 'application/pdf', oversized), 'qualification');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/too large/i);
      }
    });

    it('rejects empty files', () => {
      const result = validateUpload(makeFile('empty.pdf', 'application/pdf', 0), 'qualification');
      expect(result.ok).toBe(false);
    });
  });

  describe('selfie_video', () => {
    it('accepts MP4', () => {
      const result = validateUpload(makeFile('me.mp4', 'video/mp4', 1024), 'selfie_video');
      expect(result).toEqual({ ok: true, extension: 'mp4' });
    });

    it('rejects images', () => {
      const result = validateUpload(makeFile('me.jpg', 'image/jpeg', 1024), 'selfie_video');
      expect(result.ok).toBe(false);
    });
  });

  describe('signed_agreement', () => {
    it('accepts PDF only', () => {
      expect(
        validateUpload(makeFile('signed.pdf', 'application/pdf', 1024), 'signed_agreement').ok,
      ).toBe(true);
      expect(
        validateUpload(makeFile('signed.jpg', 'image/jpeg', 1024), 'signed_agreement').ok,
      ).toBe(false);
    });
  });

  describe('content-type vs extension consistency', () => {
    it('rejects when extension is allowed but content type is not', () => {
      const result = validateUpload(
        makeFile('cert.pdf', 'application/x-shockwave-flash', 1024),
        'qualification',
      );
      expect(result.ok).toBe(false);
    });

    it('rejects when content type allowed but extension is not', () => {
      const result = validateUpload(
        makeFile('cert.svg', 'application/pdf', 1024),
        'qualification',
      );
      expect(result.ok).toBe(false);
    });
  });
});
