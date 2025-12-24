import React, { useEffect, useMemo, useRef, useState } from 'react';
import { exportToSvg } from '@excalidraw/excalidraw';

interface ExcalidrawArticleData {
  elements: readonly any[];
  appState?: any;
  files?: Record<string, any>;
}

export interface ImageInfo {
  id: string;
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fileName?: string;
  mimeType?: string;
  dataUrl?: string;
}

interface Props {
  articleData: ExcalidrawArticleData;
  onImagesIdentified?: (images: ImageInfo[]) => void;
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

/**
 * Identifica todas las imágenes en los elementos de Excalidraw
 * @param elements Array de elementos del dibujo
 * @param files Objeto con los archivos embebidos (imágenes)
 * @returns Array con información de las imágenes encontradas
 */
export function identifyImages(
  elements: readonly any[],
  files: Record<string, any> = {}
): ImageInfo[] {
  const images: ImageInfo[] = [];

  for (const element of elements) {
    // Los elementos de tipo "image" tienen la propiedad type: "image"
    if (element.type === 'image' && element.fileId) {
      const fileId = element.fileId;
      const fileData = files[fileId];

      // Construir data URL si tenemos los datos de la imagen
      let dataUrl: string | undefined;
      let fileName: string | undefined;
      let mimeType: string | undefined;

      if (fileData) {
        // El formato puede variar, pero generalmente tiene:
        // - dataURL: ya es una data URL
        // - mimeType: tipo MIME de la imagen
        // - id: identificador del archivo
        if (fileData.dataURL) {
          dataUrl = fileData.dataURL;
        } else if (fileData.data) {
          // Si es base64 sin prefijo, construir data URL
          const mime = fileData.mimeType || 'image/png';
          dataUrl = `data:${mime};base64,${fileData.data}`;
        }

        fileName = fileData.name || fileData.id || fileId;
        mimeType = fileData.mimeType || 'image/png';
      }

      images.push({
        id: element.id,
        fileId: fileId,
        x: element.x ?? 0,
        y: element.y ?? 0,
        width: element.width ?? 0,
        height: element.height ?? 0,
        fileName,
        mimeType,
        dataUrl,
      });
    }
  }

  return images;
}

const ExcalidrawArticle: React.FC<Props> = ({ articleData, onImagesIdentified }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDark, setIsDark] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const articleDataRef = useRef(articleData);
  const [identifiedImages, setIdentifiedImages] = useState<ImageInfo[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const selectedImageRef = useRef<ImageInfo | null>(null);
  const isModalOpenRef = useRef<boolean>(false);

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

    // Identificar imágenes en los elementos
    const images = identifyImages(articleData.elements ?? [], files);
    setIdentifiedImages(images);
    
    // Notificar al callback si está disponible
    if (onImagesIdentified && images.length > 0) {
      onImagesIdentified(images);
    }

    // Log para debugging (solo en desarrollo)
    if (process.env.NODE_ENV === 'development' && images.length > 0) {
      console.log('[ExcalidrawArticle] Imágenes identificadas:', images);
    }

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
  }, [articleData, isDark, onImagesIdentified]);

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

        // Suprimir warnings de workers de Excalidraw solo durante exportToSvg
        let originalConsoleWarn: typeof console.warn | null = null;
        let originalConsoleError: typeof console.error | null = null;
        
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          originalConsoleWarn = console.warn;
          originalConsoleError = console.error;
          
          console.warn = (...args: any[]) => {
            const message = args[0]?.toString() || '';
            if (
              message.includes('Failed to use workers for subsetting') ||
              message.includes('Active worker did not respond') ||
              message.includes('downloadable font: Glyph bbox was incorrect') ||
              message.includes('Job finished! Idle worker')
            ) {
              return; // Suprimir estos warnings
            }
            originalConsoleWarn!.apply(console, args);
          };

          console.error = (...args: any[]) => {
            const message = args[0]?.toString() || '';
            if (
              message.includes('Failed to use workers for subsetting') ||
              message.includes('Active worker did not respond')
            ) {
              return; // Suprimir estos errores
            }
            originalConsoleError!.apply(console, args);
          };
        }

        let svgEl: SVGSVGElement;
        try {
          svgEl = await exportToSvg({
            elements: renderData.elements as any,
            appState: renderData.appState as any,
            files: renderData.files as any,
          });
        } finally {
          // Restaurar console original
          if (originalConsoleWarn && originalConsoleError) {
            console.warn = originalConsoleWarn;
            console.error = originalConsoleError;
          }
        }

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

        // Hacer las imágenes clicables
        if (identifiedImages.length > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ExcalidrawArticle] Intentando hacer clicables', identifiedImages.length, 'imágenes');
          }

          // Crear un mapa de fileIds y data URLs a ImageInfo
          const imageMap = new Map<string, ImageInfo>();
          const dataUrlMap = new Map<string, ImageInfo>();
          
          identifiedImages.forEach(img => {
            imageMap.set(img.fileId, img);
            imageMap.set(img.id, img);
            if (img.dataUrl) {
              // Guardar una versión corta de la data URL para comparación
              const shortDataUrl = img.dataUrl.substring(0, 100);
              dataUrlMap.set(shortDataUrl, img);
              // También guardar solo el inicio de la data URL (más flexible)
              const dataUrlStart = img.dataUrl.substring(0, 50);
              if (!dataUrlMap.has(dataUrlStart)) {
                dataUrlMap.set(dataUrlStart, img);
              }
            }
          });

          // Función para agregar ícono de expandir a una imagen
          const addExpandIcon = (imageElement: Element, imageInfo: ImageInfo, useElement?: Element) => {
            // Verificar si ya tiene ícono
            const existingIcon = svgEl.querySelector(`.excal-image-expand-icon[data-file-id="${imageInfo.fileId}"]`);
            if (existingIcon) {
              if (process.env.NODE_ENV === 'development') {
                console.log('[ExcalidrawArticle] Ícono ya existe para:', imageInfo.fileId);
              }
              return;
            }

            try {
              // Obtener las dimensiones y posición de la imagen
              let x = 0, y = 0, width = 100, height = 100;
              
              // Si hay un elemento <use>, usar sus coordenadas (son las reales)
              if (useElement) {
                const useX = useElement.getAttribute('x');
                const useY = useElement.getAttribute('y');
                const useWidth = useElement.getAttribute('width');
                const useHeight = useElement.getAttribute('height');
                
                if (useX) x = parseFloat(useX) || 0;
                if (useY) y = parseFloat(useY) || 0;
                if (useWidth) width = parseFloat(useWidth) || 100;
                if (useHeight) height = parseFloat(useHeight) || 100;
                
                if (process.env.NODE_ENV === 'development') {
                  console.log('[ExcalidrawArticle] Usando coordenadas de <use>:', { x, y, width, height });
                }
              } else {
                // Intentar obtener del atributo del elemento image
                const xAttr = imageElement.getAttribute('x');
                const yAttr = imageElement.getAttribute('y');
                const widthAttr = imageElement.getAttribute('width');
                const heightAttr = imageElement.getAttribute('height');
                
                if (xAttr) x = parseFloat(xAttr) || 0;
                if (yAttr) y = parseFloat(yAttr) || 0;
                if (widthAttr) width = parseFloat(widthAttr) || 100;
                if (heightAttr) height = parseFloat(heightAttr) || 100;
                
                // Si no hay atributos, intentar getBBox después de un pequeño delay
                if ((!xAttr || !yAttr || !widthAttr || !heightAttr)) {
                  // Usar las coordenadas de imageInfo como fallback
                  x = imageInfo.x || 0;
                  y = imageInfo.y || 0;
                  width = imageInfo.width || 100;
                  height = imageInfo.height || 100;
                  
                  if (process.env.NODE_ENV === 'development') {
                    console.log('[ExcalidrawArticle] Usando coordenadas de imageInfo:', { x, y, width, height });
                  }
                }
              }
              
              // Intentar getBBox como último recurso (después de que el SVG se renderice)
              if ((x === 0 && y === 0) || width === 100 || height === 100) {
                setTimeout(() => {
                  try {
                    const bbox = (imageElement as any).getBBox?.();
                    if (bbox && bbox.width > 0 && bbox.height > 0) {
                      x = bbox.x || x;
                      y = bbox.y || y;
                      width = bbox.width || width;
                      height = bbox.height || height;
                      if (process.env.NODE_ENV === 'development') {
                        console.log('[ExcalidrawArticle] Coordenadas actualizadas desde getBBox:', { x, y, width, height });
                      }
                      // Re-crear el ícono con las coordenadas correctas
                      addExpandIcon(imageElement, imageInfo, useElement);
                    }
                  } catch (e) {
                    // getBBox puede fallar
                  }
                }, 100);
              }

              if (process.env.NODE_ENV === 'development') {
                console.log('[ExcalidrawArticle] Agregando ícono a imagen:', { x, y, width, height, fileId: imageInfo.fileId });
              }

              // Crear grupo para el ícono (debe estar dentro del SVG)
              const svgNS = 'http://www.w3.org/2000/svg';
              const iconGroup = document.createElementNS(svgNS, 'g');
              iconGroup.setAttribute('class', 'excal-image-expand-icon');
              iconGroup.setAttribute('data-file-id', imageInfo.fileId);
              iconGroup.style.cursor = 'pointer';
              iconGroup.style.pointerEvents = 'all';
              iconGroup.style.opacity = '1';
              iconGroup.style.visibility = 'visible';
              // Asegurar que esté encima de otros elementos
              iconGroup.setAttribute('data-z-index', '9999');
              
              // Calcular posición del ícono (esquina superior izquierda - muy cerca del borde)
              const iconX = x + 0;
              const iconY = y + 5;
              
              // Fondo circular semi-transparente - hacer más visible
              const circle = document.createElementNS(svgNS, 'circle');
              circle.setAttribute('cx', String(iconX));
              circle.setAttribute('cy', String(iconY));
              circle.setAttribute('r', '16'); // Más grande
              circle.setAttribute('fill', '#000000'); // Negro sólido para mejor visibilidad
              circle.setAttribute('fill-opacity', '0.8');
              circle.setAttribute('stroke', '#ffffff');
              circle.setAttribute('stroke-width', '2.5');
              circle.style.cursor = 'pointer';
              circle.style.pointerEvents = 'all';
              circle.style.opacity = '1';
              
              // Ícono de expandir (cuatro cuadrados en esquina)
              const iconPath = document.createElementNS(svgNS, 'path');
              // Path para ícono de expandir (4 cuadrados pequeños)
              const pathData = `M ${iconX - 6} ${iconY - 6} L ${iconX - 2} ${iconY - 6} L ${iconX - 2} ${iconY - 2} L ${iconX - 6} ${iconY - 2} Z ` +
                             `M ${iconX + 2} ${iconY - 6} L ${iconX + 6} ${iconY - 6} L ${iconX + 6} ${iconY - 2} L ${iconX + 2} ${iconY - 2} Z ` +
                             `M ${iconX - 6} ${iconY + 2} L ${iconX - 2} ${iconY + 2} L ${iconX - 2} ${iconY + 6} L ${iconX - 6} ${iconY + 6} Z ` +
                             `M ${iconX + 2} ${iconY + 2} L ${iconX + 6} ${iconY + 2} L ${iconX + 6} ${iconY + 6} L ${iconX + 2} ${iconY + 6} Z`;
              iconPath.setAttribute('d', pathData);
              iconPath.setAttribute('fill', 'white');
              iconPath.setAttribute('stroke', 'white');
              iconPath.setAttribute('stroke-width', '0.5');
              iconPath.style.cursor = 'pointer';
              iconPath.style.pointerEvents = 'all';
              
              iconGroup.appendChild(circle);
              iconGroup.appendChild(iconPath);
              
              // Agregar listener de click al ícono
              const iconClickHandler = (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                if (process.env.NODE_ENV === 'development') {
                  console.log('[ExcalidrawArticle] Click en ícono de expandir:', imageInfo);
                }
                selectedImageRef.current = imageInfo;
                isModalOpenRef.current = true;
                setSelectedImage(imageInfo);
                setIsModalOpen(true);
              };
              
              iconGroup.addEventListener('click', iconClickHandler, { capture: true });
              circle.addEventListener('click', iconClickHandler, { capture: true });
              iconPath.addEventListener('click', iconClickHandler, { capture: true });
              
              // Efecto hover en el ícono
              const hoverEnter = () => {
                circle.setAttribute('fill', 'rgba(59, 130, 246, 0.9)'); // azul
              };
              const hoverLeave = () => {
                circle.setAttribute('fill', 'rgba(0, 0, 0, 0.7)');
              };
              
              iconGroup.addEventListener('mouseenter', hoverEnter);
              iconGroup.addEventListener('mouseleave', hoverLeave);
              circle.addEventListener('mouseenter', hoverEnter);
              circle.addEventListener('mouseleave', hoverLeave);
              
              // Insertar el ícono directamente en el SVG (al final para que esté encima)
              svgEl.appendChild(iconGroup);
              
              // Verificar que se insertó correctamente
              const insertedIcon = svgEl.querySelector(`.excal-image-expand-icon[data-file-id="${imageInfo.fileId}"]`);
              if (process.env.NODE_ENV === 'development') {
                console.log('[ExcalidrawArticle] Ícono agregado exitosamente', {
                  inserted: !!insertedIcon,
                  position: { iconX, iconY },
                  imagePosition: { x, y, width, height },
                  svgViewBox: svgEl.getAttribute('viewBox'),
                  svgWidth: svgEl.getAttribute('width'),
                  svgHeight: svgEl.getAttribute('height')
                });
              }
            } catch (error) {
              if (process.env.NODE_ENV === 'development') {
                console.error('[ExcalidrawArticle] Error al agregar ícono:', error);
              }
            }
          };

          // Función para hacer un elemento clicable
          const makeClickable = (element: Element, imageInfo: ImageInfo) => {
            // Evitar duplicados
            if (element.hasAttribute('data-image-clickable')) return;
            
            // Cast a SVGElement o HTMLElement para acceder a style
            const styledElement = element as SVGElement | HTMLElement;
            if ('style' in styledElement) {
              styledElement.style.cursor = 'pointer';
            }
            element.setAttribute('data-image-clickable', 'true');
            element.setAttribute('data-file-id', imageInfo.fileId);
            
            // Agregar ícono de expandir
            if (process.env.NODE_ENV === 'development') {
              console.log('[ExcalidrawArticle] Llamando addExpandIcon para:', imageInfo.fileId);
            }
            addExpandIcon(element, imageInfo, undefined);
            
            // Agregar listener de click usando React state setter
            const clickHandler = (e: Event) => {
              e.stopPropagation();
              e.preventDefault();
              if (process.env.NODE_ENV === 'development') {
                console.log('[ExcalidrawArticle] Click en imagen:', imageInfo);
              }
              // Actualizar refs y estado
              selectedImageRef.current = imageInfo;
              isModalOpenRef.current = true;
              setSelectedImage(imageInfo);
              setIsModalOpen(true);
            };
            
            element.addEventListener('click', clickHandler, { capture: true });

            // Agregar efecto hover visual
            const mouseEnterHandler = () => {
              (element as SVGElement).style.opacity = '0.9';
              (element as SVGElement).style.transition = 'opacity 0.2s';
            };
            
            const mouseLeaveHandler = () => {
              (element as SVGElement).style.opacity = '1';
            };
            
            element.addEventListener('mouseenter', mouseEnterHandler);
            element.addEventListener('mouseleave', mouseLeaveHandler);
          };

          let clickableCount = 0;

          // Buscar elementos <image> en el SVG - usar selector más amplio
          // También buscar elementos <use> que pueden referenciar symbols con imágenes
          const imageElements = svgEl.querySelectorAll('image, [xlink\\:href], [href*="data:image"]');
          const useElements = svgEl.querySelectorAll('use');
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[ExcalidrawArticle] Elementos <image> encontrados en SVG:', imageElements.length);
            console.log('[ExcalidrawArticle] Elementos <use> encontrados en SVG:', useElements.length);
            imageElements.forEach((el, idx) => {
              console.log(`[ExcalidrawArticle] Imagen ${idx}:`, {
                tagName: el.tagName,
                href: el.getAttribute('href')?.substring(0, 50) || el.getAttribute('xlink:href')?.substring(0, 50),
                id: el.getAttribute('id'),
                parent: el.parentElement?.tagName
              });
            });
            useElements.forEach((el, idx) => {
              console.log(`[ExcalidrawArticle] Use ${idx}:`, {
                href: el.getAttribute('href') || el.getAttribute('xlink:href'),
                x: el.getAttribute('x'),
                y: el.getAttribute('y'),
                width: el.getAttribute('width'),
                height: el.getAttribute('height')
              });
            });
          }

          // Primero buscar elementos <use> que pueden referenciar symbols con imágenes
          useElements.forEach((useEl) => {
            const useHref = useEl.getAttribute('href') || useEl.getAttribute('xlink:href') || '';
            if (!useHref) return;
            
            // Buscar el symbol referenciado
            const symbolId = useHref.replace('#', '');
            const symbol = svgEl.querySelector(`symbol#${symbolId}`);
            if (symbol) {
              const symbolImage = symbol.querySelector('image');
              if (symbolImage) {
                const imageHref = symbolImage.getAttribute('href') || symbolImage.getAttribute('xlink:href') || '';
                
                // Buscar la imagen correspondiente
                let matched = false;
                for (const [shortDataUrl, imageInfo] of dataUrlMap.entries()) {
                  if (imageHref.includes(shortDataUrl.substring(0, 30))) {
                    // Usar el elemento <use> para obtener coordenadas reales
                    makeClickable(useEl, imageInfo);
                    addExpandIcon(symbolImage, imageInfo, useEl);
                    clickableCount++;
                    matched = true;
                    if (process.env.NODE_ENV === 'development') {
                      console.log('[ExcalidrawArticle] Imagen mapeada desde <use> y <symbol>:', imageInfo.fileId);
                    }
                    break;
                  }
                }
                
                if (!matched && identifiedImages.length > 0) {
                  const imageToUse = identifiedImages[0];
                  makeClickable(useEl, imageToUse);
                  addExpandIcon(symbolImage, imageToUse, useEl);
                  clickableCount++;
                }
              }
            }
          });

          imageElements.forEach((imgEl, imgIdx) => {
            // Obtener el href (puede ser href o xlink:href)
            const href = imgEl.getAttribute('href') || 
                         imgEl.getAttribute('xlink:href') || '';
            
            // Si está dentro de un symbol, ya lo procesamos arriba
            if (imgEl.parentElement?.tagName === 'symbol') {
              return;
            }
            
            if (!href) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[ExcalidrawArticle] Elemento image ${imgIdx} sin href`);
              }
              // Intentar hacer clicable de todas formas si hay imágenes disponibles
              if (identifiedImages.length > 0 && identifiedImages[imgIdx]) {
                makeClickable(imgEl, identifiedImages[imgIdx]);
                clickableCount++;
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[ExcalidrawArticle] Haciendo clicable imagen ${imgIdx} sin href (por índice)`);
                }
              }
              return;
            }

            let matched = false;
            
            // Buscar por data URL (comparar primeros caracteres)
            for (const [shortDataUrl, imageInfo] of dataUrlMap.entries()) {
              const compareLength = Math.min(50, shortDataUrl.length, href.length);
              if (href.substring(0, compareLength) === shortDataUrl.substring(0, compareLength) ||
                  href.includes(shortDataUrl.substring(0, 30))) {
                makeClickable(imgEl, imageInfo);
                clickableCount++;
                matched = true;
                if (process.env.NODE_ENV === 'development') {
                  console.log('[ExcalidrawArticle] Imagen mapeada por data URL:', imageInfo.fileId);
                }
                break;
              }
            }
            
            if (!matched) {
              // Buscar por fileId en el href
              for (const [fileId, imageInfo] of imageMap.entries()) {
                if (href.includes(fileId) || href.includes(imageInfo.fileId)) {
                  makeClickable(imgEl, imageInfo);
                  clickableCount++;
                  matched = true;
                  if (process.env.NODE_ENV === 'development') {
                    console.log('[ExcalidrawArticle] Imagen mapeada por fileId:', fileId);
                  }
                  break;
                }
              }
            }

            // Si no encontramos match, usar índice o primera imagen disponible
            if (!matched && identifiedImages.length > 0) {
              const imageToUse = identifiedImages[imgIdx] || identifiedImages[0];
              makeClickable(imgEl, imageToUse);
              clickableCount++;
              if (process.env.NODE_ENV === 'development') {
                console.log(`[ExcalidrawArticle] Usando imagen por índice/fallback ${imgIdx}:`, imageToUse.fileId);
              }
            }
          });

          // Buscar grupos que contengan imágenes y hacer todo el grupo clicable
          // Esto es importante porque Excalidraw puede envolver imágenes en grupos
          const groups = svgEl.querySelectorAll('g');
          let groupIndex = 0;
          groups.forEach((group) => {
            const imageInGroup = group.querySelector('image');
            if (imageInGroup && !group.hasAttribute('data-image-clickable')) {
              const href = imageInGroup.getAttribute('href') || 
                          imageInGroup.getAttribute('xlink:href') || '';
              
              let matched = false;
              
              if (href) {
                // Buscar por data URL
                for (const [shortDataUrl, imageInfo] of dataUrlMap.entries()) {
                  const compareLength = Math.min(50, shortDataUrl.length, href.length);
                  if (href.substring(0, compareLength) === shortDataUrl.substring(0, compareLength) ||
                      href.includes(shortDataUrl.substring(0, 30))) {
                    makeClickable(group, imageInfo);
                    makeClickable(imageInGroup, imageInfo); // También hacer clicable la imagen directamente
                    clickableCount += 2;
                    matched = true;
                    if (process.env.NODE_ENV === 'development') {
                      console.log('[ExcalidrawArticle] Grupo mapeado por data URL:', imageInfo.fileId);
                    }
                    break;
                  }
                }
                
                if (!matched) {
                  // Buscar por fileId
                  for (const [fileId, imageInfo] of imageMap.entries()) {
                    if (href.includes(fileId) || href.includes(imageInfo.fileId)) {
                      makeClickable(group, imageInfo);
                      makeClickable(imageInGroup, imageInfo);
                      clickableCount += 2;
                      matched = true;
                      if (process.env.NODE_ENV === 'development') {
                        console.log('[ExcalidrawArticle] Grupo mapeado por fileId:', fileId);
                      }
                      break;
                    }
                  }
                }
              }
              
              // Si no hay match pero hay imágenes, usar por índice
              if (!matched && identifiedImages.length > 0) {
                const imageToUse = identifiedImages[groupIndex] || identifiedImages[0];
                makeClickable(group, imageToUse);
                makeClickable(imageInGroup, imageToUse);
                clickableCount += 2;
                groupIndex++;
                if (process.env.NODE_ENV === 'development') {
                  console.log('[ExcalidrawArticle] Grupo mapeado por índice:', imageToUse.fileId);
                }
              }
            }
          });

          // También buscar por elementos con IDs que coincidan con los element IDs
          identifiedImages.forEach(imageInfo => {
            const elementById = svgEl.querySelector(`[id="${imageInfo.id}"]`);
            if (elementById && !elementById.hasAttribute('data-image-clickable')) {
              makeClickable(elementById, imageInfo);
              clickableCount++;
            }
          });

          // Estrategia adicional: hacer TODAS las imágenes clicables si no se mapearon
          if (clickableCount === 0 && identifiedImages.length > 0) {
            const allImageElements = svgEl.querySelectorAll('image');
            allImageElements.forEach((imgEl, idx) => {
              if (!imgEl.hasAttribute('data-image-clickable') && identifiedImages[idx]) {
                makeClickable(imgEl, identifiedImages[idx]);
                clickableCount++;
                if (process.env.NODE_ENV === 'development') {
                  console.log('[ExcalidrawArticle] Haciendo clicable imagen por índice:', idx);
                }
              }
            });
          }

          // Estrategia final: hacer TODAS las imágenes clicables sin importar el mapeo
          // Esto garantiza que al menos una imagen sea clicable
          if (clickableCount === 0 && identifiedImages.length > 0) {
            const allImageElements = svgEl.querySelectorAll('image');
            allImageElements.forEach((imgEl) => {
              if (!imgEl.hasAttribute('data-image-clickable')) {
                makeClickable(imgEl, identifiedImages[0]);
                clickableCount++;
                if (process.env.NODE_ENV === 'development') {
                  console.log('[ExcalidrawArticle] Haciendo clicable TODAS las imágenes como último recurso');
                }
              }
            });
          }

          if (process.env.NODE_ENV === 'development') {
            console.log('[ExcalidrawArticle] Total elementos clicables creados:', clickableCount);
            console.log('[ExcalidrawArticle] Estado modal:', { isModalOpen, selectedImage: selectedImage?.fileId });
          }
        }

        if (containerRef.current) {
          containerRef.current.replaceChildren(svgEl);
          
          // Agregar delegación de eventos en el contenedor como respaldo
          // Esto captura clicks incluso si los listeners directos no funcionan
          if (identifiedImages.length > 0 && containerRef.current) {
            const containerClickHandler = (e: MouseEvent) => {
              const target = e.target as Element;
              
              // Buscar si el click fue en un elemento image
              if (target.tagName === 'image' || target.closest('image')) {
                const imageEl = target.tagName === 'image' ? target : target.closest('image');
                if (!imageEl) return;
                
                // Buscar fileId en el elemento o en sus atributos
                let fileId = imageEl.getAttribute('data-file-id');
                if (!fileId) {
                  // Intentar encontrar la imagen correspondiente por href
                  const href = imageEl.getAttribute('href') || imageEl.getAttribute('xlink:href') || '';
                  if (href) {
                    const matchedImage = identifiedImages.find(img => 
                      img.dataUrl && href.includes(img.dataUrl.substring(0, 30)) ||
                      href.includes(img.fileId)
                    );
                    if (matchedImage) {
                      fileId = matchedImage.fileId;
                    }
                  }
                }
                
                const imageInfo = fileId 
                  ? identifiedImages.find(img => img.fileId === fileId)
                  : identifiedImages[0];
                
                if (imageInfo) {
                  e.stopPropagation();
                  e.preventDefault();
                  if (process.env.NODE_ENV === 'development') {
                    console.log('[ExcalidrawArticle] Click capturado por delegación:', imageInfo.fileId);
                  }
                  setSelectedImage(imageInfo);
                  setIsModalOpen(true);
                }
              }
              // También verificar si hay un atributo data-image-clickable
              else if (target.hasAttribute('data-image-clickable') || target.closest('[data-image-clickable]')) {
                const clickableEl = target.hasAttribute('data-image-clickable') 
                  ? target 
                  : target.closest('[data-image-clickable]');
                if (clickableEl) {
                  const fileId = clickableEl.getAttribute('data-file-id');
                  if (fileId) {
                    const imageInfo = identifiedImages.find(img => img.fileId === fileId);
                    if (imageInfo) {
                      e.stopPropagation();
                      e.preventDefault();
                      if (process.env.NODE_ENV === 'development') {
                        console.log('[ExcalidrawArticle] Click capturado por delegación (data-attr):', imageInfo.fileId);
                      }
                      setSelectedImage(imageInfo);
                      setIsModalOpen(true);
                    }
                  }
                }
              }
            };
            
            containerRef.current.addEventListener('click', containerClickHandler, { capture: true });
            
            // Guardar el handler para poder removerlo después
            (containerRef.current as any).__imageClickHandler = containerClickHandler;
          }
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
      // Limpiar delegación de eventos
      if (containerRef.current && (containerRef.current as any).__imageClickHandler) {
        containerRef.current.removeEventListener('click', (containerRef.current as any).__imageClickHandler, { capture: true });
        delete (containerRef.current as any).__imageClickHandler;
      }
    };
  }, [data, articleData]);

  // Sincronizar refs con estado
  useEffect(() => {
    selectedImageRef.current = selectedImage;
    isModalOpenRef.current = isModalOpen;
  }, [selectedImage, isModalOpen]);

  // Cerrar modal con ESC
  useEffect(() => {
    if (!isModalOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectedImageRef.current = null;
        isModalOpenRef.current = false;
        setIsModalOpen(false);
        setSelectedImage(null);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isModalOpen]);

  return (
    <>
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

      {/* Modal para mostrar imagen en tamaño completo */}
      {isModalOpen && selectedImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => {
            setIsModalOpen(false);
            setSelectedImage(null);
          }}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botón cerrar */}
            <button
              onClick={() => {
                setIsModalOpen(false);
                setSelectedImage(null);
              }}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors p-2 rounded-full hover:bg-white/10"
              aria-label="Cerrar"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Imagen */}
            {selectedImage.dataUrl ? (
              <img
                src={selectedImage.dataUrl}
                alt={selectedImage.fileName || 'Imagen de Excalidraw'}
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                style={{ imageRendering: 'auto' }}
              />
            ) : (
              <div className="bg-gray-800 text-white p-8 rounded-lg">
                <p className="text-center">No se pudo cargar la imagen</p>
                <p className="text-sm text-gray-400 mt-2">File ID: {selectedImage.fileId}</p>
              </div>
            )}

            {/* Información de la imagen */}
            <div className="mt-4 text-white text-sm text-center">
              {selectedImage.fileName && (
                <p className="font-medium">{selectedImage.fileName}</p>
              )}
              <p className="text-gray-400 mt-1">
                {Math.round(selectedImage.width)} × {Math.round(selectedImage.height)} px
                {selectedImage.mimeType && ` • ${selectedImage.mimeType}`}
              </p>
            </div>

            {/* Instrucciones */}
            <p className="text-gray-400 text-xs mt-4 text-center">
              Presiona ESC o haz clic fuera para cerrar
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default ExcalidrawArticle;
