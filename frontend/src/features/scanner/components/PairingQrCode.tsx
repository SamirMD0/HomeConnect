import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

export interface PairingQrCodeProps {
  /**
   * The Scanner Hub URL to encode. The mobile client accepts either the plain
   * `http://<ip>:<port>` form (what the Hub already shows the operator) or the
   * canonical `hc://pair?h=…&p=…` payload; the plain URL keeps the printed
   * code paste-friendly on the PC side, so we encode that directly.
   */
  url: string;
  size?: number;
}

/**
 * Renders the Scanner Hub pairing QR into a canvas sized so a phone across the
 * till can still read it. 192px is the smallest size that stayed readable in
 * our shop testing; printing the panel keeps the QR crisp because it is drawn
 * at the canvas's intrinsic resolution rather than scaled from CSS.
 */
export const PairingQrCode: React.FC<PairingQrCodeProps> = ({ url, size = 192 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    QRCode.toCanvas(canvas, url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(() => setError(null)).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Could not render QR');
    });
  }, [url, size]);

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
        Could not draw the pairing QR ({error}). Phones can still enter the address manually.
      </p>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2">
      <canvas ref={canvasRef} width={size} height={size} className="block" aria-label={`Scanner Hub pairing QR for ${url}`} />
      <span className="font-mono text-[10px] text-slate-500">Scan from the phone / امسح من الهاتف</span>
    </div>
  );
};
