// Reduz uma imagem antes de enviar (JPEG, lado maior até `max` px). Usado pela agenda e pelo painel.
export async function comprimir(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    await Promise.race([img.decode(), new Promise((_, n) => setTimeout(() => n(new Error('tempo esgotado')), 8000))]);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    return blob || file;
  } catch (e) { console.warn('[imagem] não foi possível reduzir', e); return file; }
  finally { URL.revokeObjectURL(url); }
}
