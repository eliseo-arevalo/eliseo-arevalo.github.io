import React, { useEffect, useMemo, useRef, useState } from 'react';
import { exportToSvg } from '@excalidraw/excalidraw';

interface ExcalidrawArticleData {
  elements: readonly any[];
  appState?: any;
  files?: Record<string, any>;
}

interface Props {
  articleData: ExcalidrawArticleData;
}

function isDarkColor(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return false;
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 90;
}

function toLight(hex?: string): string | undefined {
  if (!hex || typeof hex !== 'string') return hex;
  if (hex === 'transparent') return hex;
  return isDarkColor(hex) ? '#e5e7eb' : hex; // gris claro Tailwind slate-200
}

const ExcalidrawArticle: React.FC<Props> = ({ articleData }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDark, setIsDark] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const articleDataRef = useRef(articleData);

  // Mantener referencia actualizada de articleData
  useEffect(() => {
    articleDataRef.current = articleData;
  }, [articleData]);

  // Ref para la función de renderizado
  const renderRef = useRef<(() => Promise<void>) | null>(null);

  // Exponer función global para generar SVG en modo claro (para impresión) y estado de loading
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const generateLightSVG = async (): Promise<SVGSVGElement | null> => {
      try {
        const data = {
          elements: articleDataRef.current.elements ?? [],
          appState: {
            ...(articleDataRef.current.appState || {}),
            viewBackgroundColor: null,
            viewModeEnabled: true,
            exportScale: 1,
            theme: 'light', // Siempre modo claro para impresión
          },
          files: (articleDataRef.current as any).files ?? {},
        };

        return await exportToSvg({
          elements: data.elements as any,
          appState: data.appState as any,
          files: data.files as any,
        });
      } catch (err) {
        console.error('[ExcalidrawArticle] Error generating light SVG:', err);
        return null;
      }
    };

    // Guardar función en el elemento con data-excal para que ExportButtons pueda acceder
    const excalElement = containerRef.current?.closest('[data-excal]') as any;
    if (excalElement) {
      excalElement.__generateLightSVG = generateLightSVG;
      excalElement.__forceLightRender = async () => {
        if (renderRef.current) {
          await renderRef.current();
        }
      };
      // Exponer el estado de loading para que ExportButtons pueda detectarlo
      excalElement.__isLoading = () => loading;
    }
  }, [loading]);

  // Detectar cambios de tema: solo obedecer la clase .dark del documento
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const compute = () => {
      return document.documentElement.classList.contains('dark');
    };
    setIsDark(compute());

    const onChange = () => setIsDark(compute());

    const mo = new MutationObserver(onChange);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mo.disconnect();
    };
  }, []);

  const data = useMemo(() => {
    const files = (articleData as any).files ?? {};

    const transformedElements = (articleData.elements ?? []).map((el: any) => {
      if (!isDark) return el;
      const next: any = { ...el };
      if (typeof next.strokeColor === 'string') {
        next.strokeColor = toLight(next.strokeColor);
      }
      if (typeof next.backgroundColor === 'string') {
        next.backgroundColor = toLight(next.backgroundColor);
      }
      return next;
    });

    const appState = {
      ...(articleData.appState || {}),
      viewBackgroundColor: null,
      viewModeEnabled: true,
      exportScale: 1,
      theme: isDark ? 'dark' : 'light',
    };

    return {
      elements: transformedElements,
      appState,
      files,
    } as const;
  }, [articleData, isDark]);

  useEffect(() => {
    let cancelled = false;

    const render = async (forceLight = false) => {
      if (cancelled) return;
      
      setLoading(true);
      try {
        // Si forceLight es true, usar datos originales en modo claro
        let renderData;
        if (forceLight) {
          renderData = {
            elements: articleData.elements ?? [],
            appState: {
              ...(articleData.appState || {}),
              viewBackgroundColor: null,
              viewModeEnabled: true,
              exportScale: 1,
              theme: 'light',
            },
            files: (articleData as any).files ?? {},
          };
        } else {
          renderData = data;
        }

        const svgEl = await exportToSvg({
          elements: renderData.elements as any,
          appState: renderData.appState as any,
          files: renderData.files as any,
        });

        if (cancelled) return;

        svgEl.style.width = '100%';
        svgEl.style.height = 'auto';
        svgEl.style.background = 'transparent';
        svgEl.style.pointerEvents = 'auto';
        (svgEl.style as any).userSelect = 'text';
        svgEl.querySelectorAll('text').forEach((t: SVGTextElement) => {
          t.style.userSelect = 'text';
          t.style.pointerEvents = 'auto';
        });

        if (containerRef.current) {
          containerRef.current.replaceChildren(svgEl);
        }
      } catch (err) {
        console.error('[ExcalidrawArticle] Error exportToSvg:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Guardar referencia para acceso externo
    renderRef.current = () => render(true);

    render();

    // Escuchar evento beforeprint para re-renderizar en modo claro ANTES de imprimir
    const handleBeforePrint = () => {
      // Re-renderizar en modo claro inmediatamente
      render(true);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeprint', handleBeforePrint);
    }

    return () => {
      cancelled = true;
      renderRef.current = null;
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeprint', handleBeforePrint);
      }
    };
  }, [data, articleData]);

  return (
    <div className="relative" data-excal data-excal-id="main-excal" style={{ width: '100%', minHeight: '60vh' }}>
      <div ref={containerRef} className="relative z-0" style={{ width: '100%', height: 'auto' }} />
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
            <p className="text-sm text-gray-700 dark:text-gray-300">Cargando dibujo…</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcalidrawArticle;
