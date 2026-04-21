'use client';

import { useEffect, useRef } from 'react';

interface Props {
  /** Must match the bot username registered for this domain (no @). */
  botUsername: string;
  /** Path to the verify-login endpoint, e.g., "/api/telegram/verify-login". */
  authCallbackUrl: string;
  /** "small" | "medium" | "large" */
  size?: 'small' | 'medium' | 'large';
  /** Request the user's photo URL in the payload. */
  requestPhoto?: boolean;
  /** CSS classes for the wrapper div. */
  className?: string;
}

/**
 * Wraps the Telegram Login Widget <script>.
 * See https://core.telegram.org/widgets/login
 *
 * The widget renders inside the wrapper div and Telegram will redirect to
 * `authCallbackUrl` with signed payload params on successful login.
 */
export function TelegramLoginWidget({
  botUsername,
  authCallbackUrl,
  size = 'medium',
  requestPhoto = false,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', size);
    script.setAttribute('data-auth-url', authCallbackUrl);
    script.setAttribute('data-request-access', 'write');
    if (requestPhoto) script.setAttribute('data-userpic', 'true');

    containerRef.current.appendChild(script);
  }, [botUsername, authCallbackUrl, size, requestPhoto]);

  return <div ref={containerRef} className={className} />;
}
