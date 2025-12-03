import React, { useRef, useEffect, useState } from 'react';

interface ExportButtonsProps {
  title?: string;
  excalId?: string; // ID del contenedor del Excalidraw para encontrar el SVG
}

const ExportButtons: React.FC<ExportButtonsProps> = ({ title = 'Nota', excalId }) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExcalLoading, setIsExcalLoading] = useState(true);
  const previousThemeRef = useRef<string | null>(null);

  // Detectar si el SVG de Excalidraw está cargando
  useEffect(() => {
    const checkLoading = () => {
      const excalContainer = document.querySelector('[data-excal]') as any;
      if (excalContainer && typeof excalContainer.__isLoading === 'function') {
        const isLoading = excalContainer.__isLoading();
        setIsExcalLoading(isLoading);
        return isLoading;
      } else {
        // Si no hay contenedor o no tiene la función, asumir que está cargando
        setIsExcalLoading(true);
        return true;
      }
    };

    // Verificar inmediatamente
    checkLoading();

    // Verificar periódicamente hasta que termine de cargar
    const interval = setInterval(() => {
      const stillLoading = checkLoading();
      if (!stillLoading) {
        clearInterval(interval);
      }
    }, 100);

    // Limpiar intervalo después de un tiempo máximo
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setIsExcalLoading(false);
    }, 10000); // Máximo 10 segundos

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []); // Sin dependencias para evitar loops

  const handlePrintPDF = async () => {
    // Bloquear si el SVG está cargando
    if (isExcalLoading) {
      return;
    }

    try {
      setIsPrinting(true);

      // Guardar el tema actual
      const isDark = document.documentElement.classList.contains('dark');
      previousThemeRef.current = isDark ? 'dark' : 'light';

      // Cambiar a modo claro temporalmente
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');

      // Forzar re-renderizado del SVG en modo claro
      const excalContainer = document.querySelector('[data-excal]') as any;
      if (excalContainer && typeof excalContainer.__forceLightRender === 'function') {
        await excalContainer.__forceLightRender();
      }

      // Disparar evento beforeprint
      const beforePrintEvent = new Event('beforeprint');
      window.dispatchEvent(beforePrintEvent);

      // Esperar un momento para que todo se actualice
      await new Promise(resolve => setTimeout(resolve, 300));

      // Abrir el diálogo de impresión
      window.print();
    } catch (error) {
      console.error('Error al preparar impresión:', error);
    } finally {
      // El tema se restaurará en el evento afterprint
    }
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      // Restaurar el tema anterior
      if (previousThemeRef.current === 'dark') {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      setIsPrinting(false);
    };

    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const handleDownloadSVG = async () => {
    // Bloquear si el SVG está cargando
    if (isExcalLoading) {
      return;
    }

    try {
      // Buscar el contenedor de Excalidraw
      const excalContainer = document.querySelector('[data-excal]');
      if (!excalContainer) {
        alert('No se encontró ningún dibujo Excalidraw');
        return;
      }

      // Intentar usar la función generadora de SVG si está disponible
      const excalElement = excalContainer as any;
      let svgElement: SVGSVGElement | null = null;

      if (excalElement && typeof excalElement.__generateSVG === 'function') {
        // Generar nuevo SVG en el tema actual
        svgElement = await excalElement.__generateSVG();
      }

      // Fallback: usar el SVG renderizado actualmente
      if (!svgElement) {
        svgElement = excalContainer.querySelector('svg');
      }

      // Último fallback: buscar cualquier SVG en el artículo
      if (!svgElement) {
        const article = document.querySelector('article');
        if (article) {
          svgElement = article.querySelector('svg');
        }
      }

      if (!svgElement) {
        alert('No se encontró ningún SVG para descargar');
        return;
      }

      // Clonar el SVG para no modificar el original
      const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;

      // Asegurar que el SVG tenga dimensiones explícitas
      const bbox = svgElement.getBBox();
      clonedSvg.setAttribute('width', String(bbox.width || svgElement.getAttribute('width') || '800'));
      clonedSvg.setAttribute('height', String(bbox.height || svgElement.getAttribute('height') || '600'));
      clonedSvg.setAttribute('viewBox', svgElement.getAttribute('viewBox') || `0 0 ${bbox.width} ${bbox.height}`);

      // Serializar el SVG
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);

      // Crear el blob y descargar
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error al descargar SVG:', error);
      alert('Error al descargar el SVG');
    }
  };

  return (
    <>
      {/* Loading overlay */}
      {isPrinting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm print:hidden">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl flex flex-col items-center gap-4 min-w-[200px]">
            <div className="h-10 w-10 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Preparando PDF...
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 mb-8 print:hidden">
        <button
          onClick={handlePrintPDF}
          disabled={isPrinting || isExcalLoading}
          className="group flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-white dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/20 transition-all text-sm font-medium shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
          title={isExcalLoading ? 'Esperando a que cargue el dibujo...' : 'Exportar como PDF'}
        >
          {isPrinting ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              <span className="hidden sm:inline">Preparando...</span>
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4 transition-transform group-hover:scale-110"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              <span className="hidden sm:inline">PDF</span>
            </>
          )}
        </button>
      {excalId && (
        <button
          onClick={handleDownloadSVG}
          disabled={isExcalLoading}
          className="group flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-white dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/20 transition-all text-sm font-medium shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
          title={isExcalLoading ? 'Esperando a que cargue el dibujo...' : 'Descargar SVG'}
        >
          <svg
            className="w-4 h-4 transition-transform group-hover:scale-110"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          <span className="hidden sm:inline">SVG</span>
        </button>
      )}
      </div>
    </>
  );
};

export default ExportButtons;

