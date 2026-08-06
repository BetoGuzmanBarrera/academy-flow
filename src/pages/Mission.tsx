import { Compass, Heart, Shield, Sparkles } from 'lucide-react';

export function Mission() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Nuestra Misión</h1>
        <div className="w-24 h-1 bg-blue-600 mx-auto"></div>
      </div>

      <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-12 text-white mb-16">
        <div className="flex items-center justify-center mb-8">
          <div className="bg-white/20 rounded-full p-4">
            <Compass size={48} />
          </div>
        </div>

        <p className="text-2xl md:text-3xl text-center leading-relaxed mb-8">
          Proporcionar servicios educativos de la más alta calidad que empoderen a los
          estudiantes para alcanzar sus metas académicas, ofreciendo soluciones personalizadas,
          eficientes y confiables.
        </p>

        <p className="text-xl text-center text-blue-100">
          Nos comprometemos a ser el puente entre los estudiantes y su éxito académico,
          manteniendo los más altos estándares de integridad y profesionalismo.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="text-blue-600" size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Calidad</h3>
          <p className="text-gray-600 text-sm">
            Garantizar excelencia en cada servicio que ofrecemos
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Heart className="text-blue-600" size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Compromiso</h3>
          <p className="text-gray-600 text-sm">
            Dedicación total al éxito de nuestros estudiantes
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Shield className="text-blue-600" size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Confianza</h3>
          <p className="text-gray-600 text-sm">
            Construir relaciones basadas en transparencia e integridad
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Compass className="text-blue-600" size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Orientación</h3>
          <p className="text-gray-600 text-sm">
            Guiar a cada estudiante hacia sus objetivos
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-8 mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Cómo Cumplimos Nuestra Misión
        </h2>

        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 font-bold">
              1
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Atención Personalizada
              </h3>
              <p className="text-gray-600">
                Cada estudiante recibe atención individualizada que se adapta a sus necesidades
                específicas y estilo de aprendizaje.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 font-bold">
              2
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Profesionales Calificados
              </h3>
              <p className="text-gray-600">
                Contamos con un equipo de expertos altamente capacitados en cada plataforma
                educativa que ofrecemos.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 font-bold">
              3
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Precios Justos y Transparentes
              </h3>
              <p className="text-gray-600">
                Ofrecemos tarifas competitivas sin costos ocultos, asegurando que la educación
                de calidad sea accesible.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 font-bold">
              4
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Soporte Continuo
              </h3>
              <p className="text-gray-600">
                Brindamos asistencia constante antes, durante y después de la prestación del
                servicio para garantizar tu satisfacción total.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 font-bold">
              5
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Mejora Continua
              </h3>
              <p className="text-gray-600">
                Evaluamos y mejoramos constantemente nuestros procesos para ofrecer la mejor
                experiencia posible a nuestros usuarios.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Nuestro Compromiso Contigo
        </h2>
        <p className="text-gray-700 text-lg leading-relaxed max-w-3xl mx-auto">
          En Academy Flow, cada decisión que tomamos está guiada por nuestro compromiso
          inquebrantable con tu éxito académico. No somos solo un proveedor de servicios;
          somos tu socio en el camino hacia la excelencia educativa.
        </p>
      </div>
    </div>
  );
}
