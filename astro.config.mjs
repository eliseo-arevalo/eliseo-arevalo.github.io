import { defineConfig } from 'astro/config';
import react from "@astrojs/react";
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  // Configuración para GitHub Pages
  // Si tu repositorio es: https://github.com/usuario/repositorio
  // El site debe ser: https://usuario.github.io/repositorio
  // Si es un repositorio de usuario/organización (usuario.github.io), el site debe ser: https://usuario.github.io
  site: 'https://eliseo-arevalo.github.io',
  output: 'static',
  integrations: [react(), tailwind(), mdx()],
});