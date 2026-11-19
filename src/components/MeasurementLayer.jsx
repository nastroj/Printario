import { useLayoutEffect, useRef } from 'react';
import { measureAndPaginate } from '../lib/paginate.js';
import { SongMeasureBlock } from './SongView.jsx';

export function MeasurementLayer({ book, settings, geometry, onMeasured }) {
  const rootRef = useRef(null);
  const runRef = useRef(0);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !book) return undefined;

    let cancelled = false;
    const run = ++runRef.current;

    const measure = async () => {
      try {
        await document.fonts?.ready;
      } catch {
        // Font loading can reject in some embedded browsers; measure anyway.
      }
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled || run !== runRef.current) return;
      try {
        const result = measureAndPaginate(root, book, settings);
        if (!cancelled && run === runRef.current) onMeasured(result);
      } catch (error) {
        console.error('[printario] Typesetting failed:', error);
        if (!cancelled && run === runRef.current) onMeasured(null, error);
      }
    };

    measure();
    return () => {
      cancelled = true;
    };
  }, [book, settings, geometry.contentWidthPx, onMeasured]);

  return (
    <div className="measurement-layer" aria-hidden="true">
      <div
        className="measurement-root"
        ref={rootRef}
        style={{ width: `${geometry.contentWidthPx}px` }}
      >
        {book.songs.map((song, index) => (
          <SongMeasureBlock song={song} index={index} settings={settings} key={song.id ?? index} />
        ))}
      </div>
    </div>
  );
}
