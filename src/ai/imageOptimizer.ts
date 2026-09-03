// ============================================================
// POINTAGE — High-Resolution Document Image Optimizer
// Specifically tuned for Samsung Galaxy A54 5G 50MP Camera
// Preserves fine text, references, and barcodes without blur
// ============================================================

export interface OptimizedImage {
  base64: string;
  mimeType: string;
  originalSize: number;
  optimizedSize: number;
  width: number;
  height: number;
}

/**
 * Optimizes a high-resolution camera photo (e.g. 50MP Samsung Galaxy A54)
 * down to a crisp 2.5K (2560px) document scan that preserves razor-sharp OCR
 * while staying well within Gemini payload and mobile memory limits.
 */
export async function optimizeDocumentImage(
  file: File | Blob,
  maxDimension = 2560,
  quality = 0.90
): Promise<OptimizedImage> {
  return new Promise((resolve, reject) => {
    const originalSize = file.size;
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down only if larger than maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Impossible d’initialiser le contexte graphique Canvas 2D'));
        return;
      }

      // High quality bicubic filtering for ultra-sharp text
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Fill white background in case of PNG transparency
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Échec de la compression de l’image'));
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1] || '';
            resolve({
              base64,
              mimeType,
              originalSize,
              optimizedSize: blob.size,
              width,
              height,
            });
          };
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(blob);
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de charger l’image capturée'));
    };

    img.src = url;
  });
}
