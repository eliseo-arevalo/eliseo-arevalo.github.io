import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Model3DProps {
  modelPath: string;
  className?: string;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
}

function Model({ modelPath }: { modelPath: string }) {
  const { scene } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null);
  
  useEffect(() => {
    if (scene && groupRef.current) {
      // Calcular el bounding box del modelo original
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      // Calcular escala para zoom (reducido más)
      const maxDim = Math.max(size.x, size.y, size.z);
      const baseScale = maxDim > 0 ? 2.7 / maxDim : 1;
      
      // Aplicar escala
      scene.scale.setScalar(baseScale);
      
      // Centrar el modelo y luego moverlo hacia abajo
      scene.position.set(-center.x * baseScale, -center.y * baseScale - 0.6, -center.z * baseScale);
      
      // Mejorar la iluminación de los materiales del modelo
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            // Asegurar que los materiales respondan a la luz
            // Si es un array de materiales
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            
            materials.forEach((material: THREE.Material) => {
              if (material instanceof THREE.MeshStandardMaterial || 
                  material instanceof THREE.MeshPhysicalMaterial ||
                  material instanceof THREE.MeshPhongMaterial) {
                // Mejorar propiedades de iluminación
                material.needsUpdate = true;
                // Aumentar la emisividad para que brille más
                if ('emissive' in material) {
                  (material as any).emissive = new THREE.Color(0x222222);
                  (material as any).emissiveIntensity = 0.2;
                }
                // Mejorar el metalness y roughness para mejor reflejo de luz
                if ('metalness' in material) {
                  (material as any).metalness = 0.3;
                  (material as any).roughness = 0.4;
                }
              } else if (material instanceof THREE.MeshBasicMaterial) {
                // Convertir materiales básicos a estándar para que respondan a la luz
                const newMaterial = new THREE.MeshStandardMaterial({
                  color: material.color,
                  map: material.map,
                  transparent: material.transparent,
                  opacity: material.opacity,
                });
                newMaterial.emissive = new THREE.Color(0x111111);
                newMaterial.emissiveIntensity = 0.1;
                mesh.material = newMaterial;
              }
            });
          }
        }
      });
    }
  }, [scene]);
  
  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

// Componente para luces que iluminan directamente el modelo
function ModelLights() {
  const light1Ref = useRef<THREE.PointLight>(null);
  const light2Ref = useRef<THREE.PointLight>(null);
  const light3Ref = useRef<THREE.PointLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);
  
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const radius = 2.5;
    
    // Luces principales que rotan alrededor del modelo
    if (light1Ref.current) {
      light1Ref.current.position.x = Math.cos(time * 0.4) * radius;
      light1Ref.current.position.z = Math.sin(time * 0.4) * radius;
      light1Ref.current.position.y = 0.5;
    }
    
    if (light2Ref.current) {
      light2Ref.current.position.x = Math.cos(time * 0.4 + Math.PI * 0.66) * radius;
      light2Ref.current.position.z = Math.sin(time * 0.4 + Math.PI * 0.66) * radius;
      light2Ref.current.position.y = 0.5;
    }
    
    if (light3Ref.current) {
      light3Ref.current.position.x = Math.cos(time * 0.4 + Math.PI * 1.33) * radius;
      light3Ref.current.position.z = Math.sin(time * 0.4 + Math.PI * 1.33) * radius;
      light3Ref.current.position.y = 0.5;
    }
    
    // Rim light que sigue el modelo
    if (rimLightRef.current) {
      rimLightRef.current.position.x = Math.cos(time * 0.3) * 4;
      rimLightRef.current.position.z = Math.sin(time * 0.3) * 4;
      rimLightRef.current.position.y = 2;
    }
  });
  
  return (
    <>
      {/* Luces principales que iluminan el modelo desde diferentes ángulos */}
      <pointLight
        ref={light1Ref}
        color="#60a5fa"
        intensity={2.5}
        distance={6}
        decay={1.5}
      />
      <pointLight
        ref={light2Ref}
        color="#a78bfa"
        intensity={2.5}
        distance={6}
        decay={1.5}
      />
      <pointLight
        ref={light3Ref}
        color="#f472b6"
        intensity={2.5}
        distance={6}
        decay={1.5}
      />
      
      {/* Rim light para resaltar los bordes del modelo */}
      <directionalLight
        ref={rimLightRef}
        color="#fbbf24"
        intensity={1.5}
      />
      
      {/* Luz key desde arriba */}
      <spotLight
        position={[0, 4, 0]}
        angle={0.6}
        penumbra={0.7}
        intensity={3}
        color="#ffffff"
      />
      
      {/* Luz fill desde abajo para reducir sombras duras */}
      <pointLight
        position={[0, -2, 0]}
        color="#4a5568"
        intensity={1}
        distance={5}
      />
    </>
  );
}

export default function Model3D({ 
  modelPath, 
  className = '', 
  autoRotate = true,
  autoRotateSpeed = 1 
}: Model3DProps) {
  return (
    <div className={`${className} rounded-full overflow-hidden relative`} style={{ width: '100%', height: '100%', position: 'relative', background: 'transparent' }}>
      <Canvas
        camera={{ position: [0, 0, 4], fov: 25, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', width: '100%', height: '100%', display: 'block', position: 'absolute', top: 0, left: 0 }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          {/* Iluminación ambiente suave */}
          <ambientLight intensity={0.6} />
          
          {/* Luces específicas para iluminar el modelo */}
          <ModelLights />
          
          {/* Modelo 3D */}
          <Model modelPath={modelPath} />
          
          {/* Ambiente HDR para mejor iluminación global */}
          <Environment preset="sunset" />
          
          {/* Controles de órbita (rotación suave) */}
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate={autoRotate}
            autoRotateSpeed={autoRotateSpeed}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI / 2.2}
            enableDamping
            dampingFactor={0.05}
            makeDefault
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
