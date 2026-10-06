import qrcode from 'qrcode-generator';

/** A QR code for `text` as an inline SVG string (black on white, as scanners expect). */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 1, margin: 2, scalable: true });
}
